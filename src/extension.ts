"use strict";

import * as vscode from "vscode";
import { TeletypeClient } from "@atom/teletype-client";
import GuestPortalBinding from "./GuestPortalBinding";

import * as fetch from "node-fetch";
import * as constants from "./constants";
import { PortalBindingManager } from "./PortalBindingManager";
import { HostPortalBinding } from "./HostPortalBinding";
const globalAny: any = global;
const wrtc: any = require("wrtc");

const PORTAL_ID_KEY = "teletype-portal-id";
const AUTH_KEY = "teletype-auth-key";

globalAny.window = {};
globalAny.window = global;
globalAny.window.fetch = fetch;
globalAny.RTCPeerConnection = wrtc.RTCPeerConnection;

const info = vscode.window.showInformationMessage;
const warn = vscode.window.showWarningMessage;
const error = vscode.window.showErrorMessage;

async function initializeTeletypeClient(context: vscode.ExtensionContext): Promise<TeletypeClient> {
    try {
        const client = new TeletypeClient({
            pusherKey: constants.PUSHER_KEY,
            pusherOptions: {
                cluster: constants.PUSHER_CLUSTER,
            },
            baseURL: constants.API_URL_BASE,
            connectionTimeout: 15000,
        });

        await client.initialize();
        return client;
    } catch (err) {
        error("Teletype client initialize failed with message " + err.message);
        throw err;
    }
}

// this method is called when the extension is activated
// the extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const localStorage: vscode.Memento = context.globalState;
    const client = await initializeTeletypeClient(context);
    const portalManager = new PortalBindingManager({ client });

    async function signIn(authToken: string) {
        try {
            if (!(await client.signIn(authToken))) {
                vscode.window
                    .showInformationMessage("Invalid authentication token", "Login")
                    .then(selection => {
                        if (selection) {
                            vscode.env.openExternal(
                                vscode.Uri.parse("https://teletype.atom.io/login")
                            );
                        }
                    });
            } else {
                vscode.window
                    .showInformationMessage(
                        "You've signed in as " + client.getLocalUserIdentity().login,
                        "Join Portal"
                    )
                    .then(_ => vscode.commands.executeCommand("extension.join-portal"));
                localStorage.update(AUTH_KEY, authToken);
            }
        } catch (e) {
            error(`Exception occurred at signin: ${e}`);
        }
    }

    const teletypeSignInHandle = vscode.commands.registerCommand(
        "extension.teletype-sign-in",
        async () => {
            if (client.isSignedIn()) {
                info("Already signed in, log out first if you want to change user");
                return;
            }

            const authToken = await getAuthToken(localStorage);

            if (!authToken) {
                info("Please enter a non-empty authentication token");
                return;
            }
            signIn(authToken);
        }
    );

    const teletypeSignOutHandle = vscode.commands.registerCommand(
        "extension.teletype-sign-out",
        async () => {
            if (!client.isSignedIn()) {
                info("Already signed out");
                return;
            }
            client.signOut();
            info("Signed out, now you can change your authentication token");
        }
    );

    async function autoSignIn(): Promise<boolean> {
        if (!client.isSignedIn()) {
            const legacyAuthToken = localStorage.get<string>(AUTH_KEY);

            if (legacyAuthToken == undefined) {
                info("Sign in first", "Sign In").then(_ => {
                    vscode.commands.executeCommand("extension.teletype-sign-in");
                });
                return false;
            } else {
                info("Detected legacy authentication token, signing in.");
                if (await client.signIn(legacyAuthToken)) {
                    info(`Signed in as ${client.getLocalUserIdentity().login}.`);
                } else {
                    localStorage.update(AUTH_KEY, undefined);
                    info("Auto sign in failed, please manually signin");
                    vscode.commands.executeCommand("extension.teletype-sign-in");
                    return false;
                }
            }
        }
        return true;
    }

    const joinPortalHandle = vscode.commands.registerCommand("extension.join-portal", async () => {
        if (!(await autoSignIn())) {
            return;
        }
        const portalIdInput = await getPortalID(localStorage);
        if (!portalIdInput) {
            info("No Portal ID has been entered. Please try again");
        } else {
            info(`Trying to Join Portal with ID ${portalIdInput}`);
            if (await joinPortal(portalIdInput, portalManager)) {
                localStorage.update(PORTAL_ID_KEY, portalIdInput);
            }
        }
    });

    const sharePortalHandle = vscode.commands.registerCommand(
        "extension.share-portal",
        async () => {
            if (!(await autoSignIn())) {
                return;
            }
            const portalBinding = portalManager.createOrGetHostPortalBinding();
            if (!(await portalBinding.initialize())) {
                error("Share portal failed because of some reason");
            } else {
                vscode.window
                    .showInformationMessage(
                        "Portal shared as " + portalBinding.portal.id,
                        "Copy Portal Id",
                        "Copy Atom Portal"
                    )
                    .then(selection => {
                        if (selection === "Copy Portal Id") {
                            vscode.env.clipboard.writeText(portalBinding.portal.id);
                        } else if (selection === "Copy Atom Portal") {
                            vscode.env.clipboard.writeText(
                                "atom://teletype/portal/" + portalBinding.portal.id
                            );
                        }
                    });
            }
        }
    );

    const closePoralHandle = vscode.commands.registerCommand("extension.close-portal", () => {
        const portalBinding = portalManager.getHostPortalBinding();
        if (!portalBinding) {
            info("Host portal is not active");
        } else {
            portalBinding.close();
            info("Host portal closed");
        }
    });

    const leavePortalHandle = vscode.commands.registerCommand("extension.leave-portal", () => {
        console.log("now trying to leave portal");
        const binding = portalManager.getActivePortalBinding();
        if (binding instanceof HostPortalBinding) {
            info("Cannot leave when sharing portal", "Stop sharing").then(_ => {
                vscode.commands.executeCommand("extension.close-portal");
            });
        } else if (binding instanceof GuestPortalBinding) {
            binding.leave();
        } else {
            info("Cannot leave a non-existent portal");
        }
    });

    context.subscriptions.push(
        teletypeSignInHandle,
        teletypeSignOutHandle,
        joinPortalHandle,
        sharePortalHandle,
        closePoralHandle,
        leavePortalHandle,
        portalManager
    );

    console.log("Great, your extension \"vscode-teletype\" is now active!");
}

async function getAuthToken(localStorage: vscode.Memento): Promise<string | undefined> {
    return vscode.window.showInputBox({
        prompt: "Please enter your auth token from https://teletype.atom.io/login",
        value: localStorage.get(AUTH_KEY),
    });
}

async function getPortalID(localStoraget: vscode.Memento): Promise<string | undefined> {
    return vscode.window.showInputBox({
        prompt: "Enter ID of the Portal you wish to join",
        value: localStoraget.get(PORTAL_ID_KEY),
    });
}

async function joinPortal(portalId: string, portalManager: PortalBindingManager): Promise<boolean> {
    try {
        const portal_binding = portalManager.createGuestPortalBinding(portalId);
        return portal_binding.initialize();
    } catch (error) {
        error(`Join portal failed with error: ${error}`);
        return false;
    }
}

export function deactivate(): void {}
