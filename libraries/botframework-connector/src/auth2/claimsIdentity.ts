/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
export interface Claim {
    readonly type: string;
    readonly value: string;
}

export class ClaimsIdentity {
    readonly isAuthenticated: boolean;
    readonly claims: Claim[];

    constructor(claims: Claim[], isAuthenticated: boolean) {
        this.claims = claims;
        this.isAuthenticated = true;
    }

    getClaimValue(claimType: string): string | null {
        let claim = this.claims.find(c => c.type === claimType);
        return claim ? claim.value : null;
    }
}