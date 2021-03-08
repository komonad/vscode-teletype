"use strict";

import * as vscode from "vscode";
import { TeletypeClient } from "@atom/teletype-client";
import GuestPortalBinding from "./GuestPortalBinding";

import * as fetch from "node-fetch";
import * as constants from "./constants";
import { PortalBindingManager } from "./PortalBindingManager";
const globalAny: any = global;
const wrtc: any = require("wrtc");

const PORTAL_ID_KEY = "teletype-portal-id";
const AUTH_KEY = "teletype-auth-key";

globalAny.window = {};
globalAny.window = global;
globalAny.window.fetch = fetch;
globalAny.RTCPeerConnection = wrtc.RTCPeerConnection;

let portalManager: PortalBindingManager | undefined;

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
    } catch (error) {
        vscode.window.showErrorMessage(
            "Teletype client initialize failed with message " + error.message
        );
        throw error;
    }
}

// this method is called when the extension is activated
// the extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log("Great, your extension \"vscode-teletype\" is now active!");

    const localStorage: vscode.Memento = context.globalState;

    const client = await initializeTeletypeClient(context);

    const portalManager = new PortalBindingManager({ client });

    async function signIn(authToken: string) {
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
    }

    const teletypeSignInHandle = vscode.commands.registerCommand(
        "extension.teletype-sign-in",
        async () => {
            if (client.isSignedIn()) {
                vscode.window.showInformationMessage(
                    "Already signed in, log out first if you want to change user"
                );
                return;
            }

            const authToken = await getAuthToken(localStorage);

            if (!authToken) {
                vscode.window.showInformationMessage(
                    "Please enter a non-empty authentication token"
                );
                return;
            }
            signIn(authToken);
        }
    );

    const teletypeSignOutHandle = vscode.commands.registerCommand(
        "extension.teletype-sign-out",
        async () => {
            if (!client.isSignedIn()) {
                vscode.window.showInformationMessage("Already signed out");
                return;
            }
            client.signOut();
            vscode.window.showInformationMessage(
                "Signed out, now you can change your authentication token"
            );
        }
    );

    const joinPortalHandle = vscode.commands.registerCommand("extension.join-portal", async () => {
        if (!client.isSignedIn()) {
            const legacyAuthToken = localStorage.get<string>(AUTH_KEY);

            if (legacyAuthToken == undefined) {
                vscode.window.showInformationMessage("Sign in first", "Sign In").then(_ => {
                    vscode.commands.executeCommand("extension.teletype-sign-in");
                });
                return;
            } else {
                vscode.window.showInformationMessage("Detected legacy authentication token, signing in.");
                if (await client.signIn(legacyAuthToken)) {
                    vscode.window.showInformationMessage(`Signed in as ${client.getLocalUserIdentity().login}.`);
                } else {
                    localStorage.update(AUTH_KEY, undefined);
                    vscode.window.showInformationMessage("Auto sign in failed, please manually signin");
                    vscode.commands.executeCommand("extension.teletype-sign-in");
                    return;
                }
            }
        }
        const portalIdInput = await getPortalID(localStorage);
        if (!portalIdInput) {
            vscode.window.showInformationMessage("No Portal ID has been entered. Please try again");
        } else {
            vscode.window.showInformationMessage(`Trying to Join Portal with ID ${portalIdInput}`);
            if (!(await joinPortal(portalIdInput, portalManager))) {
                vscode.window.showWarningMessage("Some errors occurred");
            } else {
                localStorage.update(PORTAL_ID_KEY, portalIdInput);
            }
        }
    });

    const sharePortalHandle = vscode.commands.registerCommand(
        "extension.share-portal",
        async () => {
            // TODO
        }
    );

    const leavePortalHandle = vscode.commands.registerCommand("extension.leave-portal", () => {
        console.log("now trying to leave portal");
        const binding = portalManager.getActivePortalBinding();
        if (!binding) {
            vscode.window.showInformationMessage("Cannot leave a non-existent portal");
        } else {
            binding.leave();
        }
    });

    context.subscriptions.push(
        teletypeSignInHandle,
        teletypeSignOutHandle,
        joinPortalHandle,
        sharePortalHandle,
        leavePortalHandle,
        portalManager
    );
}

async function loginWithToken(
    client: TeletypeClient,
    localStorage: vscode.Memento
): Promise<boolean> {
    const token = await vscode.window.showInputBox({
        prompt: "Please enter your auth token from https://teletype.atom.io/login",
        value: localStorage.get(AUTH_KEY),
    });

    if (!token) {
        vscode.window.showInformationMessage("Please enter non-empty authentication token");
        return false;
    }

    try {
        const result = await client.signIn(token);
        if (!result) {
            vscode.window.showInformationMessage(
                "Invalid authentication token, please copy from https://teletype.atom.io/login"
            );
        }
    } catch (error) {
        vscode.window.showErrorMessage("Unable to signin teletype, got exception: " + error);
        return false;
    }

    vscode.window.showInformationMessage(`Logged in as ${client.getLocalUserIdentity()}`);

    return true;
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

async function joinPortal(portalId: any, portalManager: PortalBindingManager): Promise<boolean> {
    try {
        const portal_binding = portalManager.createGuestPortalBinding(portalId);
        return portal_binding.initialize();
    } catch (error) {
        vscode.window.showErrorMessage(`Join portal failed with error: ${error}`);
        return false;
    }
}

export function deactivate(): void {}
