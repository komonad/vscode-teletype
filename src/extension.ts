'use strict';

import * as vscode from 'vscode';
import { TeletypeClient } from '@atom/teletype-client';
import GuestPortalBinding from './GuestPortalBinding';


const fetch = require('node-fetch');
const constants = require('./constants');
const globalAny: any = global;
const wrtc = require('wrtc');

globalAny.window = {};
globalAny.window = global;
globalAny.window.fetch = fetch;
globalAny.RTCPeerConnection = wrtc.RTCPeerConnection;

// this method is called when the extension is activated
// the extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	console.log('Great, your extension "vscode-teletype" is now active!');
	let joinPortalHandle = vscode.commands.registerCommand('extension.join-portal', async () => {
		let portalIdInput = await getPortalID();
		if (!portalIdInput) {
			vscode.window.showInformationMessage("No Portal ID has been entered. Please try again");
		}
		else {
			vscode.window.showInformationMessage('Trying to Join Portal with ID' + ' ' + portalIdInput + ' ');
			if (!await joinPortal(portalIdInput)) {
				vscode.window.showWarningMessage("Some errors occurred");
			}
		}
	});

	let sharePortalHandle = vscode.commands.registerCommand('extension.share-portal', async () => {
		// TODO
	});
	
	context.subscriptions.push(joinPortalHandle, sharePortalHandle);
}

async function getPortalID() {
	let portalID = await vscode.window.showInputBox({ prompt: 'Enter ID of the Portal you wish to join' });
	return portalID;
}

async function joinPortal(portalId: any): Promise<boolean> {
	let textEditor = vscode.window.activeTextEditor;
	let client, portal_binding;
	
	if (constants.AUTH_TOKEN === '') {
		vscode.window.showErrorMessage("GitHub Auth Token. Please provide it in the constants.ts file");
		return false;
	}

	try {
		client = new TeletypeClient({
			pusherKey: constants.PUSHER_KEY,
			pusherOptions: {
				cluster: constants.PUSHER_CLUSTER
			},
			baseURL: constants.API_URL_BASE,
			connectionTimeout: 15000
		});

		await client.initialize();
		await client.signIn(constants.AUTH_TOKEN);

		portal_binding = new GuestPortalBinding({ client: client, portalId: portalId, editor: textEditor });
		return portal_binding.initialize();
	} catch (error) {
		vscode.window.showErrorMessage(`join portal failed with error: ${error}`);
		return false;
	}
}

export function deactivate() { }
