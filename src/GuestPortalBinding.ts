import * as assert from "assert";
import * as vscode from "vscode";
import {
    TeletypeClient,
    Errors,
    Portal,
    FollowState,
    EditorProxy,
    BufferProxy,
    Position,
    PortalDelegate,
} from "@atom/teletype-client";
import BufferBinding from "./BufferBinding";
import EditorBinding from "./EditorBinding";

import * as os from "os";
import * as path from "path";
import * as fs from "fs";
// import * as mkdir from 'mkdirp-promise';

export default class GuestPortalBinding implements PortalDelegate {
    public client: TeletypeClient;
    private readonly portalId: string;
    private readonly editor?: vscode.TextEditor;
    private portal!: Portal;
    private tetherState?: number;
    private tetherEditorProxy?: EditorProxy;
    private disposed!: boolean;
    private lastEditorProxyChangePromise: Promise<void>;
    private onAddEditorProxy: any;
    private onRemoveEditorProxy: any;
    private joinEvents: any;
    private editorBindingsByEditorProxy: Map<EditorProxy, EditorBinding>;
    private bufferBindingsByBufferProxy: Map<BufferProxy, BufferBinding>;
    private bufferBindingsByBuffer: Map<vscode.TextDocument, BufferBinding>;
    private editorBindingsByEditor: Map<vscode.TextEditor, EditorBinding>;
    private editorProxiesByEditor: WeakMap<vscode.TextEditor, EditorProxy>;
    private hostClosedPortal = false;
    private hostLostConnection = false;
    private leaveEvents: string[] = [];
    private editorProxies: Set<EditorProxy> = new Set();
    private tetherEditorProxyChangeCounter: any;
    private tetherPosition?: Position;
    private activePositionsBySiteId = {};

    constructor({
        client,
        portalId,
        editor,
    }: {
        client: TeletypeClient;
        portalId: string;
        editor?: vscode.TextEditor;
    }) {
        this.client = client;
        this.portalId = portalId;
        this.editor = editor;
        this.lastEditorProxyChangePromise = Promise.resolve();
        this.editorBindingsByEditorProxy = new Map();
        this.bufferBindingsByBufferProxy = new Map();
        this.bufferBindingsByBuffer = new Map();
        this.editorBindingsByEditor = new Map();
        this.editorProxiesByEditor = new WeakMap();
        this.tetherEditorProxyChangeCounter = 0;
    }

    async initialize(): Promise<boolean> {
        try {
            this.portal = await this.client.joinPortal(this.portalId);
            if (!this.portal) {
                return false;
            }
            await this.portal.setDelegate(this);

            vscode.window.showInformationMessage(
                "Joined Portal with ID" + " " + this.portalId + " "
            );
            this.registerWorkspaceEvents();
            return true;
        } catch (error) {
            console.error("%0", error);
            let message: string;
            if (error instanceof Errors.PortalNotFoundError) {
                message = "Portal not found: the portal you were trying to join does not exist";
            } else {
                message = `Failed to join portal: Attemping to join portal failed with error: ${error.message}`;
            }
            vscode.window.showErrorMessage(message);
            return false;
        }
    }

    private registerWorkspaceEvents() {
        vscode.workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this));
        vscode.workspace.onWillSaveTextDocument(this.saveDocument.bind(this));
        vscode.window.onDidChangeTextEditorSelection(this.triggerSelectionChanges.bind(this));
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
        this.bufferBindingsByBuffer?.get(event.document)?.onDidChangeBuffer(event.contentChanges);
    }

    private saveDocument(event: vscode.TextDocumentWillSaveEvent) {
        const bufferBinding = this.bufferBindingsByBuffer.get(event.document);
        if (bufferBinding) {
            event.waitUntil(bufferBinding.requestSavePromise());
        }
    }

    private triggerSelectionChanges(event: vscode.TextEditorSelectionChangeEvent) {
        this.editorBindingsByEditor.get(event.textEditor)?.updateSelections(event.selections);
    }

    dispose(): void {
        this.disposed = true;
    }

    isDisposed(): boolean {
        return this.disposed;
    }

    hostDidClosePortal(): void {
        vscode.window.showInformationMessage("Portal closed by host");
        this.hostClosedPortal = true;
    }

    hasHostClosedPortal(): boolean {
        return this.hostClosedPortal;
    }

    hostDidLoseConnection(): void {
        vscode.window.showInformationMessage("Portal host lose connection");
        this.hostLostConnection = true;
    }

    hasHostLostConnection(): boolean {
        return this.hostLostConnection;
    }

    addEditorProxy(editorProxy: EditorProxy): void {
        if (editorProxy && this.editorProxies) {
            if (typeof this.onAddEditorProxy === "function") {
                this.onAddEditorProxy(editorProxy);
            }
            console.log("addEditorProxy: " + editorProxy.bufferProxy.uri);
            if (!this.editorProxies.has(editorProxy)) {
                // console.log('Cannot add the same editor proxy multiple times remove/add again');
                // this.editorProxies.delete(editorProxy);
                this.editorProxies.add(editorProxy);
            }
        }
    }

    removeEditorProxy(editorProxy: EditorProxy): void {
        if (typeof this.onRemoveEditorProxy === "function") {
            this.onRemoveEditorProxy(editorProxy);
        }
        assert(
            this.editorProxies.has(editorProxy),
            "Can only remove editor proxies that had previously been added"
        );
        this.editorProxies.delete(editorProxy);
        if (this.tetherEditorProxy === editorProxy) {
            this.tetherEditorProxy = undefined;
            this.tetherEditorProxyChangeCounter++;
        }
    }

    editorProxyForURI(uri: string): EditorProxy | undefined {
        return Array.from(this.editorProxies).find((e: any) => e.bufferProxy.uri === uri);
    }

    getTetherEditorProxy(): EditorProxy | undefined {
        return this.tetherEditorProxy;
    }

    getTetherBufferProxyURI(): string | null {
        return this.tetherEditorProxy ? this.tetherEditorProxy.bufferProxy.uri : null;
    }

    getEditorProxies(): EditorProxy[] {
        return Array.from(this.editorProxies);
    }

    // called after portal.setDelegate(this)
    async updateTether(state: number, editorProxy: EditorProxy, position: Position): Promise<void> {
        if (editorProxy) {
            this.lastEditorProxyChangePromise = this.lastEditorProxyChangePromise.then(() =>
                this.onUpdateTether(state, editorProxy, position)
            );
        }
        console.log("updateTether: " + editorProxy.bufferProxy.uri);
        this.addEditorProxy(editorProxy);
        this.tetherState = state;
        if (editorProxy !== this.tetherEditorProxy) {
            this.tetherEditorProxy = editorProxy;
            this.tetherEditorProxyChangeCounter++;
        }
        this.tetherPosition = position;

        return this.lastEditorProxyChangePromise;
    }

    private async onUpdateTether(state: number, editorProxy: EditorProxy, position: Position) {
        if (state === FollowState.RETRACTED) {
            await this.findOrCreateEditorByEditorProxy(editorProxy);
        } else {
            this.editorBindingsByEditorProxy.forEach((editor_binding: any) =>
                editor_binding.updateTether(state, position)
            );
        }

        const editorBinding = this.editorBindingsByEditorProxy.get(editorProxy);
        if (editorBinding && position) {
            editorBinding.updateTether(state, position);
        }
    }

    private async findOrCreateEditorByEditorProxy(editorProxy: EditorProxy): Promise<vscode.TextEditor> {
        let editor: vscode.TextEditor;
        let editorBinding = this.editorBindingsByEditorProxy.get(editorProxy);
        if (editorBinding) {
            editor = editorBinding.editor;
        } else {
            const { bufferProxy } = editorProxy;
            const [buffer, bufferBinding] = await this.findOrCreateBufferForBufferProxy(
                bufferProxy
            );
            await vscode.workspace.openTextDocument(buffer.uri);

            console.log("find buffer, now show it");
            editor = await vscode.window.showTextDocument(buffer);

            editorBinding = new EditorBinding({
                editor,
                portal: this.portal,
                isHost: false,
            });

            await vscode.commands.executeCommand("workbench.action.keepEditor");

            bufferBinding.setEditor(editor);

            editorBinding.setEditorProxy(editorProxy);
            editorProxy.setDelegate(editorBinding);

            this.editorBindingsByEditorProxy.set(editorProxy, editorBinding);
            this.editorProxiesByEditor.set(editor, editorProxy);
            this.editorBindingsByEditor.set(editor, editorBinding);

            editorBinding.onDidDispose(() => {
                this.editorProxiesByEditor.delete(editor);
                this.editorBindingsByEditorProxy.delete(editorProxy);
            });
        }
        return editor;
    }

    private async findOrCreateBufferForBufferProxy(
        bufferProxy: any
    ): Promise<[vscode.TextDocument, BufferBinding]> {
        let buffer: vscode.TextDocument;
        let bufferBinding = this.bufferBindingsByBufferProxy.get(bufferProxy);
        if (bufferBinding) {
            buffer = bufferBinding.buffer;
        } else {
            const uri = path.join(os.tmpdir(), `\\${this.portalId}\\`, bufferProxy.uri);

            console.log(`try to write file at ${uri}`);

            const bufferURI = vscode.Uri.file(uri);

            await require("mkdirp-promise")(path.dirname(bufferURI.fsPath));
            await fs.promises.writeFile(bufferURI.fsPath, "");

            console.log("wrote file, now open");

            buffer = await vscode.workspace.openTextDocument(bufferURI);

            bufferBinding = new BufferBinding({
                buffer,
                isHost: false,
                didDispose: () => this.bufferBindingsByBufferProxy.delete(bufferProxy),
            });

            bufferBinding.setBufferProxy(bufferProxy);
            bufferProxy.setDelegate(bufferBinding);

            this.bufferBindingsByBuffer.set(buffer, bufferBinding);
            this.bufferBindingsByBufferProxy.set(bufferProxy, bufferBinding);
        }
        return [buffer, bufferBinding];
    }

    getTetherState(): number | undefined  {
        return this.tetherState;
    }

    getTetherPosition(): Position | undefined {
        return this.tetherPosition;
    }

    updateActivePositions(positionsBySiteId: Position): void {
        // this.sitePositionsComponent.update({positionsBySiteId})
    }

    // TODO
    siteDidJoin(siteId: string): void {
        this.joinEvents.push(siteId);
    }

    // TODO
    siteDidLeave(siteId: string): void {
        this.leaveEvents.push(siteId);
    }

    // TODO
    didChangeEditorProxies(): void {}
}