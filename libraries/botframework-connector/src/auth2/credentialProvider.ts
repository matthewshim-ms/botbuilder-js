/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * CredentialProvider interface. This interface allows Bots to provide their own
 * implemention of what is, and what is not, a valid appId and password. This is
 * useful in the case of multi-tenant bots, where the bot may need to call
 * out to a service to determine if a particular appid/password pair
 * is valid.
 *
 * For Single Tenant bots (the vast majority) the simple static providers
 * are sufficent.
 */
export interface ICredentialProvider {
    /**
     * Validate AppId.
     *
     * This method is async to enable custom implementations
     * that may need to call out to serviced to validate the appId / password pair.
     */
    isValidAppId(appId: string): Promise<boolean>

    /**
     * Get the app password for a given bot appId, if it is not a valid appId, return Null
     *
     * This method is async to enable custom implementations
     * that may need to call out to serviced to validate the appId / password pair.
     */
    getAppPassword(appId: string): Promise<string|null>

    /**
     * Checks if bot authentication is disabled.
     * Return true if bot authentication is disabled.
     *
     * This method is async to enable custom implementations
     * that may need to call out to serviced to validate the appId / password pair.
     */
    isAuthenticationDisabled(): Promise<boolean>
}

export class SimpleCredentialProvider implements ICredentialProvider {

    readonly appId: string;
    readonly appPassword: string;

    constructor(appId: string, appPassword: string) {
        this.appId = appId;
        this.appPassword = appPassword;
    }

    isValidAppId(appId: string): Promise<boolean> {
        return Promise.resolve(this.appId === appId);
    }

    getAppPassword(appId: string): Promise<string|null> {
        return Promise.resolve((this.appId === appId) ? this.appPassword : null);
    }

    isAuthenticationDisabled(): Promise<boolean> {
        return Promise.resolve(!this.appId);
    }
}