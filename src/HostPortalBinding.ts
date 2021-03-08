import { BufferProxy, EditorProxy, FollowState, Portal, PortalDelegate, Position, TeletypeClient } from "@atom/teletype-client";
import * as vscode from "vscode";
import BufferBinding from "./BufferBinding";
import { CompositeDisposable } from "./CompositeDisposable";
import EditorBinding from "./EditorBinding";

export class HostPortalBinding implements PortalDelegate {
    private client: TeletypeClient;
    public portal!: Portal;
    private tetherState?: number;
    private editorBindingsByUri: Map<vscode.Uri, EditorBinding> = new Map();
    private bufferBindingsByUri: Map<vscode.Uri, BufferBinding> = new Map();
    private editorBindingsByEditorProxy: Map<EditorProxy, EditorBinding> = new Map();
    private bufferBindingsByBufferProxy: Map<BufferProxy, BufferBinding> = new Map();
    private editorProxies: Set<EditorProxy> = new Set();
    private subscriptions: CompositeDisposable = new CompositeDisposable();
    private lastUpdateTetherPromise: Promise<void> = Promise.resolve();
    private onDispose: () => any = () => {};

    constructor({
        client,
        portalId,
        onDispose
    }: {
        client: TeletypeClient;
        portalId: string;
        onDispose: () => any;
    }) {
        this.client = client;
        this.onDispose = onDispose;
    }

    async initialize(): Promise<boolean> {
        this.portal = await this.client.createPortal();
        if (!this.portal) {
            return false;
        }
        this.portal.setDelegate(this);
        this.registerWorkspaceEvents();

        const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        statusBar.text = "Teletype";

        vscode.window.showInformationMessage("Portal shared as " + this.portal.id, "Copy Portal Id")
            .then(_ => {
                vscode.env.clipboard.writeText(this.portal.id);
            });

        // TODO
        return true;
    }

    private findOrCreateBufferProxyForBuffer(document: vscode.TextDocument): BufferProxy {
        let bufferBinding = this.bufferBindingsByUri.get(document.uri);
        if (bufferBinding) {
            return bufferBinding.bufferProxy;
        }
        bufferBinding = new BufferBinding({
            buffer: document,
            isHost: true,
            didDispose: () => {}
        });

        const bufferProxy = this.portal.createBufferProxy({
            uri: document.uri
        });

        bufferProxy.setDelegate(bufferBinding);
        bufferBinding.setBufferProxy(bufferProxy);
        this.bufferBindingsByUri.set(document.uri, bufferBinding);
        this.bufferBindingsByBufferProxy.set(bufferProxy, bufferBinding);

        return bufferProxy;
    }

    private findOrCreateEditorProxyForEditor(editor: vscode.TextEditor): EditorProxy {
        const uri = editor.document.uri;
        let editorBinding = this.editorBindingsByUri.get(uri);
        if (editorBinding) {
            return editorBinding.editorProxy;
        }

        const bufferProxy = this.findOrCreateBufferProxyForBuffer(editor.document);
        const editorProxy = this.portal.createEditorProxy({bufferProxy});

        editorBinding = new EditorBinding({editor, portal: this.portal, isHost: true});
        editorBinding.setEditorProxy(editorProxy);
        editorProxy.setDelegate(editorBinding);

        this.editorBindingsByUri.set(uri, editorBinding);
        this.editorBindingsByEditorProxy.set(editorProxy, editorBinding);

        editorBinding.onDidDispose(() => {
            // TODO
            this.editorBindingsByEditorProxy.delete(editorProxy);
            this.editorBindingsByUri.delete(uri);
        });

        return editorProxy;
    }

    private registerWorkspaceEvents() {
        this.subscriptions.add(
            vscode.workspace.onDidOpenTextDocument(this.onDidOpenTextDocument.bind(this)),
            vscode.workspace.onDidCloseTextDocument(this.onDidCloseTextDocument.bind(this)),
            vscode.window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor.bind(this)),
            vscode.window.onDidChangeTextEditorSelection(this.onDidChangeTextEditorSelection.bind(this)),
        );
    }

    private onDidChangeActiveTextEditor(e: vscode.TextEditor | undefined) {
        if (!e) {
            this.portal.activateEditorProxy(null);
            return;
        }
        const editorProxy = this.findOrCreateEditorProxyForEditor(e);
        this.portal.activateEditorProxy(editorProxy);
    }

    private onDidChangeTextEditorSelection(e: vscode.TextEditorSelectionChangeEvent) {

    }

    private onDidOpenTextDocument(doc: vscode.TextDocument) {

    }

    private onDidCloseTextDocument(doc: vscode.TextDocument) {

    }

    dispose(): void {}
    async updateTether(state: number, editorProxy: EditorProxy, position: Position): Promise<void> {
        if (editorProxy) {
            this.lastUpdateTetherPromise = this.lastUpdateTetherPromise.then(() => {
                this.onUpdateTether(state, editorProxy, position);
            });
        }
        return this.lastUpdateTetherPromise;
    }

    private async onUpdateTether(followState: number, editorProxy: EditorProxy, position: Position) {
        const editorBinding = this.editorBindingsByEditorProxy.get(editorProxy);
        // TODO
    }

    updateActivePositions(positionsBySiteId: Position): void {

    }
    hostDidLoseConnection(): void {

    }
    hostDidClosePortal(): void {

    }
    siteDidLeave(siteId: string): void {
        const {login} = this.portal.getSiteIdentity(siteId);
        vscode.window.showInformationMessage(`@${login} has left your portal`);
    }
    siteDidJoin(siteId: string): void {
        const {login} = this.portal.getSiteIdentity(siteId);
        vscode.window.showInformationMessage(`@${login} has joined your portal`);
    }
    didChangeEditorProxies(): void {

    }

}