/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as jwt from 'jsonwebtoken';
import { ClaimsIdentity, Claim } from "./claimsIdentity";
import { config } from 'shelljs';
import { OpenIdMetadata } from './openIdMetadata';
import { Constants } from './constants';

export class JwtTokenExtractor {

    private static openIdMetadataCache: Map<string, OpenIdMetadata> = new Map<string, OpenIdMetadata>();

    tokenValidationParameters: jwt.VerifyOptions;
    openIdMetadata: OpenIdMetadata;

    constructor(tokenValidationParameters: jwt.VerifyOptions, metadataUrl: string, allowedSigningAlgorithms: string[]/*, validator: EndorsementsValidator*/) {
        this.tokenValidationParameters = { ...tokenValidationParameters };
        this.tokenValidationParameters.algorithms = allowedSigningAlgorithms; // TODO: move out!
        this.openIdMetadata = JwtTokenExtractor.getOrAddOpenIdMetadata(metadataUrl);
        // TODO: this.validator = validator
    }

    static getOrAddOpenIdMetadata(metadataUrl: string): OpenIdMetadata {
        let metadata = JwtTokenExtractor.openIdMetadataCache.get(metadataUrl);
        if (!metadata) {
            metadata = new OpenIdMetadata(metadataUrl);
            JwtTokenExtractor.openIdMetadataCache.set(metadataUrl, metadata);
        }

        return metadata;
    }

    public async getIdentityFromAuthHeader(authorizationHeader: string): Promise<ClaimsIdentity | null> {
        if (!authorizationHeader) {
            return null;
        }

        let parts = authorizationHeader.split(' ');
        if (parts.length == 2) {
            return await this.getIdentity(parts[0], parts[1]);
        }

        return null;
    }

    public async getIdentity(scheme: string, parameter: string): Promise<ClaimsIdentity | null> {
        // No header in correct scheme or no token
        if (scheme !== "Bearer" || !parameter) {
            return null;
        }

        // Issuer isn't allowed? No need to check signature
        if (!this.hasAllowedIssuer(parameter)) {
            return null;
        }

        try {
            return await this.validateToken(parameter);
        }
        catch (err) {
            console.log('JwtTokenExtractor.getIdentity:err!', err);
            throw err;
        }
    }

    private hasAllowedIssuer(jwtToken: string): boolean {
        let decoded = <any>jwt.decode(jwtToken, { complete: true });
        let issuer: string = decoded.payload.iss;

        if (Array.isArray(this.tokenValidationParameters.issuer)) {
            return this.tokenValidationParameters.issuer.indexOf(issuer) != -1;
        }

        if (typeof this.tokenValidationParameters.issuer === "string") {
            return this.tokenValidationParameters.issuer === issuer;
        }

        return false;
    }

    private async validateToken(jwtToken: string): Promise<ClaimsIdentity> {
        /*
            // _openIdMetadata only does a full refresh when the cache expires every 5 days
            OpenIdConnectConfiguration config = null;
            try
            {
                config = await _openIdMetadata.GetConfigurationAsync().ConfigureAwait(false);
            }
            catch (Exception e)
            {
                Trace.TraceError($"Error refreshing OpenId configuration: {e}");

                // No config? We can't continue
                if (config == null)
                    throw;
            }
        */

        let decodedToken = <any>jwt.decode(jwtToken, { complete: true });

        // Update the signing tokens from the last refresh
        let metadataKey = await this.openIdMetadata.getKey(decodedToken.header.kid);
        if (!metadataKey) {
            throw new Error('Sigin Key could not be retrieved.');
        }

        try {
            let decodedPayload = <any>jwt.verify(jwtToken, metadataKey.key, this.tokenValidationParameters);

            // TODO:
            // if (_validator != null)
            // {
            //     string keyId = (string)parsedJwtToken?.Header?[AuthenticationConstants.KeyIdHeader];
            //     var endorsements = await _endorsementsData.GetConfigurationAsync();
            //     if (!string.IsNullOrEmpty(keyId) && endorsements.ContainsKey(keyId))
            //     {
            //         if (!_validator(endorsements[keyId]))
            //         {
            //             throw new UnauthorizedAccessException($"Could not validate endorsement for key: {keyId} with endorsements: {string.Join(",", endorsements[keyId])}");
            //         }
            //     }
            // }

            if (this.tokenValidationParameters.algorithms) {
                if (this.tokenValidationParameters.algorithms.indexOf(decodedToken.header.alg) === -1) {
                    throw new Error(`"Token signing algorithm '${decodedToken.header.alg}' not in allowed list`);
                }
            }

            let claims: Claim[] = Object.keys(decodedPayload).reduce(function (acc, key) {
                acc.push({ type: key, value: decodedPayload[key] });
                return acc;
            }, <Claim[]>[]);

            return new ClaimsIdentity(claims, true);

        } catch (err) {
            console.log("Error finding key for token. Available keys: " + metadataKey.key);
            throw err;
        }
    }
}