import { BufferProxy, EditorProxy, FollowState, Portal, PortalDelegate, Position, PositionMap, TeletypeClient } from "@atom/teletype-client";
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
    private initialized: boolean = false;
    

    constructor({
        client,
        onDispose
    }: {
        client: TeletypeClient;
        onDispose: () => any;
    }) {
        this.client = client;
        this.onDispose = onDispose;
    }

    leave(): void {
        // TODO
    }

    async initialize(): Promise<boolean> {
        if (this.initialized) { // already initialized
            return true;
        }

        this.portal = await this.client.createPortal();
        if (!this.portal) {
            return false;
        }
        this.portal.setDelegate(this);
        this.registerWorkspaceEvents();

        const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        statusBar.text = "Teletype";

        
        // TODO
        return true;
    }

    private findOrCreateBufferProxyForBuffer(document: vscode.TextDocument): [BufferProxy, BufferBinding] {
        let bufferBinding = this.bufferBindingsByUri.get(document.uri);
        if (bufferBinding) {
            return [bufferBinding.bufferProxy, bufferBinding];
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

        return [bufferProxy, bufferBinding];
    }

    private findOrCreateEditorProxyForEditor(editor: vscode.TextEditor): EditorProxy {
        const uri = editor.document.uri;
        let editorBinding = this.editorBindingsByUri.get(uri);
        if (editorBinding) {
            return editorBinding.editorProxy;
        }

        const [bufferProxy, bufferBinding] = this.findOrCreateBufferProxyForBuffer(editor.document);
        const editorProxy = this.portal.createEditorProxy({bufferProxy});

        editorBinding = new EditorBinding({editor, portal: this.portal, isHost: true});
        editorBinding.setEditorProxy(editorProxy);
        
        bufferBinding.setEditorBinding(editorBinding);
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
            vscode.workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)),
            vscode.window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor.bind(this)),
            vscode.window.onDidChangeVisibleTextEditors(this.onDidChangeVisibleTextEditors.bind(this)),
            vscode.window.onDidChangeTextEditorSelection(this.onDidChangeTextEditorSelection.bind(this)),
        );
    }

    private onDidChangeVisibleTextEditors(e: vscode.TextEditor[]) {
        // TODO
    }

    private onDidChangeTextDocument(e: vscode.TextDocumentChangeEvent) {
        this.bufferBindingsByUri.get(e.document.uri)?.onDidChangeBuffer(e.contentChanges);
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
        const editorBinding = this.editorBindingsByUri.get(e.textEditor.document.uri);
        editorBinding?.updateSelections(e.selections);
    }

    private onDidOpenTextDocument(doc: vscode.TextDocument) {
        // TODO
        
        // this.findOrCreateBufferProxyForBuffer(doc);
        // console.log(`opened doc with uri ${doc.uri.toString()}`);
    }

    private onDidCloseTextDocument(doc: vscode.TextDocument) {
        // TODO
    }

    dispose(): void {
        this.portal.dispose();
    }

    async updateTether(state: number, editorProxy: EditorProxy, position: Position): Promise<void> {
        if (editorProxy) {
            this.lastUpdateTetherPromise = this.lastUpdateTetherPromise.then(() => {
                this.onUpdateTether(state, editorProxy, position);
            });
        }
        return this.lastUpdateTetherPromise;
    }

    private async onUpdateTether(followState: number, editorProxy: EditorProxy, position: Position) {
        // I don't know exactly what the following code means, I just copied it from Atom's teletype
        const editorBinding = this.editorBindingsByEditorProxy.get(editorProxy);
        if (!editorBinding) {
            console.warn(`unexpected editorProxy as ${JSON.stringify(editorProxy)}`);
            return;
        }
        if (followState === FollowState.RETRACTED) {
            editorBinding.editor = await vscode.window.showTextDocument(editorBinding.editor.document);
            if (position) {
                editorBinding.updateTether(followState, position);
            }
        } else {
            this.editorBindingsByEditorProxy.forEach(e => e.updateTether(followState));
        }
    }

    updateActivePositions(positionsBySiteId: PositionMap): void {
        // TODO
    }

    hostDidLoseConnection(): void {
        console.log("Host lost connection");
    }
    
    hostDidClosePortal(): void {
        console.log("host closed portal");
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