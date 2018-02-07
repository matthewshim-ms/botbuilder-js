/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as jwt from 'jsonwebtoken';
import { ICredentialProvider } from './credentialProvider';
import { JwtTokenExtractor } from './jwtTokenExtractor';
import { Constants } from './constants';
import { ClaimsIdentity } from './claimsIdentity';

export module EmulatorValidation {

    // The AppId Claim is only used during emulator token validation.
    const AppIdClaim: string = "appid";

    const VersionClaim: string = "ver";

    export const ToBotFromEmulatorTokenValidationParameters: jwt.VerifyOptions = {
        issuer: [
            'https://sts.windows.net/d6d49420-f39b-4df7-a1dc-d59a935871db/',                    // Auth v3.1, 1.0 token
            'https://login.microsoftonline.com/d6d49420-f39b-4df7-a1dc-d59a935871db/v2.0',      // Auth v3.1, 2.0 token
            'https://sts.windows.net/f8cdef31-a31e-4b4a-93e4-5f571e91255a/',                    // Auth v3.2, 1.0 token
            'https://login.microsoftonline.com/f8cdef31-a31e-4b4a-93e4-5f571e91255a/v2.0',      // Auth v3.2, 2.0 token
            'https://sts.windows.net/72f988bf-86f1-41af-91ab-2d7cd011db47/'                     // ???
        ],
        audience: undefined,                                                                    // Audience validation takes place manually in code.
        clockTolerance: 5 * 60,
        ignoreExpiration: false
    };

    /// <summary>
    /// Determines if a given Auth header is from the Bot Framework Emulator
    /// </summary>
    /// <param name="authHeader">Bearer Token, in the "Bearer [Long String]" Format.</param>
    /// <returns>True, if the token was issued by the Emulator. Otherwise, false.</returns>
    export function isTokenFromEmulator(authHeader: string): boolean {
        // The Auth Header generally looks like this:
        // "Bearer eyJ0e[...Big Long String...]XAiO"
        if (!authHeader) {
            // No token. Can't be an emulator token.
            return false;
        }

        let parts = authHeader.split(' ');
        if (parts.length !== 2) {
            // Emulator tokens MUST have exactly 2 parts. If we don't have 2 parts, it's not an emulator token
            return false;
        }

        let authScheme = parts[0];
        let bearerToken = parts[1];

        // We now have an array that should be:
        // [0] = "Bearer"
        // [1] = "[Big Long String]"
        if (authScheme !== 'Bearer') {
            // The scheme from the emulator MUST be "Bearer"
            return false;
        }

        // Parse the Big Long String into an actual token.
        let token = <any>jwt.decode(bearerToken, { complete: true });
        if (!token) {
            return false;
        }

        // Is there an Issuer?
        let issuer: string = token.payload.iss;
        if (!issuer) {
            // No Issuer, means it's not from the Emulator.
            return false;
        }

        // Is the token issues by a source we consider to be the emulator?
        if (ToBotFromEmulatorTokenValidationParameters.issuer && ToBotFromEmulatorTokenValidationParameters.issuer.indexOf(issuer) === -1) {
            // Not a Valid Issuer. This is NOT a Bot Framework Emulator Token.
            return false;
        }

        // The Token is from the Bot Framework Emulator. Success!
        return true;
    }

    /// <summary>
    /// Validate the incoming Auth Header as a token sent from the Bot Framework Emulator.
    /// </summary>
    /// <param name="authHeader">The raw HTTP header in the format: "Bearer [longString]"</param>
    /// <param name="credentials">The user defined set of valid credentials, such as the AppId.</param>
    /// <returns>
    /// A valid ClaimsIdentity.
    /// </returns>
    /// <remarks>
    /// A token issued by the Bot Framework will FAIL this check. Only Emulator tokens will pass.
    /// </remarks>
    export async function authenticateEmulatorToken(authHeader: string, credentials: ICredentialProvider): Promise<ClaimsIdentity> {

        let tokenExtractor = new JwtTokenExtractor(
            ToBotFromEmulatorTokenValidationParameters,
            Constants.ToBotFromEmulatorOpenIdMetadataUrl,
            Constants.AllowedSigningAlgorithms);

        let identity = await tokenExtractor.getIdentityFromAuthHeader(authHeader);
        if (!identity) {
            // No valid identity. Not Authorized.
            throw new Error('Unauthorized. No valid identity.');
        }

        if (!identity.isAuthenticated) {
            // The token is in some way invalid. Not Authorized.
            throw new Error('Unauthorized. Is not authenticated');
        }

        // Now check that the AppID in the claimset matches
        // what we're looking for. Note that in a multi-tenant bot, this value
        // comes from developer code that may be reaching out to a service, hence the
        // Async validation.
        let versionClaim = identity.getClaimValue(VersionClaim);
        if (versionClaim === null) {
            throw new Error('Unauthorized. "ver" claim is required on Emulator Tokens.');
        }

        let appId: string = '';

        // The Emulator, depending on Version, sends the AppId via either the
        // appid claim (Version 1) or the Authorized Party claim (Version 2).
        if (!versionClaim || versionClaim === '1.0') {
            // either no Version or a version of "1.0" means we should look for
            // the claim in the "appid" claim.
            let appIdClaim = identity.getClaimValue(AppIdClaim);
            if (!appIdClaim) {
                // No claim around AppID. Not Authorized.
                throw new Error('Unauthorized. "appid" claim is required on Emulator Token version "1.0".');
            }

            appId = appIdClaim;
        } else if (versionClaim === '2.0') {
            // Emulator, "2.0" puts the AppId in the "azp" claim.
            let appZClaim = identity.getClaimValue(Constants.AuthorizedParty);
            if (!appZClaim) {
                // No claim around AppID. Not Authorized.
                throw new Error('Unauthorized. "azp" claim is required on Emulator Token version "2.0".');
            }

            appId = appZClaim;
        } else if (versionClaim === '3.0') {
            // The v3.0 Token types have been disallowed. Not Authorized.
            throw new Error('Unauthorized. Emulator token version "3.0" is depricated.');
        } else if (versionClaim === '3.1' || versionClaim === '3.2') {
            // The emulator for token versions "3.1" & "3.2" puts the AppId in the "Audiance" claim.
            let audianceClaim = identity.getClaimValue(Constants.AudienceClaim);
            if (!audianceClaim) {
                // No claim around AppID. Not Authorized.
                throw new Error('Unauthorized. "aud" claim is required on Emulator Token version "3.x".');
            }

            appId = audianceClaim;
        } else {
            // Unknown Version. Not Authorized.
            throw new Error(`Unauthorized. Unknown Emulator Token version "${versionClaim}".`);
        }

        if (!await credentials.isValidAppId(appId)) {
            throw new Error(`Unauthorized. Invalid AppId passed on token: ${appId}`);
        }

        return identity;
    }
}