import * as fs from "fs";
import * as vscode from "vscode";

import { BufferDelegate, BufferProxy, Position } from "@atom/teletype-client";

export default class BufferBinding implements BufferDelegate {
    public readonly buffer: vscode.TextDocument;
    private editor!: vscode.TextEditor;
    private readonly isHost: boolean;
    private bufferProxy!: BufferProxy;
    private onGetText: any;
    public didDispose: Function;
    private disposed!: boolean;
    private onUpdateText: any;
    private onInsert: any;
    private onDelete: any;
    private subscriptions: vscode.Disposable;
    private disableHistory = false;

    constructor({
        buffer,
        isHost,
        didDispose,
    }: {
        buffer: vscode.TextDocument;
        isHost: boolean;
        didDispose: any;
    }) {
        this.buffer = buffer;
        this.isHost = isHost;
        this.didDispose = didDispose;
        // TODO
        this.subscriptions = vscode.Disposable.from();
        if (isHost) {
            // TODO
        }
    }

    didChangeURI(text: string): void {
        // TODO
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.subscriptions.dispose();
        // TODO
        this.disposed = true;
    }
    isDisposed(): boolean {
        return this.disposed;
    }
    getText(): any {
        if (typeof this.onGetText === "function") {
            return this.onGetText();
        }
        return null;
    }

    setBufferProxy(bufferProxy: BufferProxy): void {
        this.bufferProxy = bufferProxy;
    }

    // called once at the initialization
    setText(text: string): void {
        fs.writeFileSync(this.buffer.uri.fsPath, text);
    }

    setEditor(editor: vscode.TextEditor): void {
        this.editor = editor;
    }

    async updateText(textUpdates: any[]): Promise<boolean> {
        if (textUpdates.length === 0) {
            return true;
        }
        this.disableHistory = true;
        return this.editor
            .edit(
                builder => {
                    for (let i = textUpdates.length - 1; i >= 0; i--) {
                        const textUpdate = textUpdates[i];
                        builder.replace(
                            this.createRange(textUpdate.oldStart, textUpdate.oldEnd),
                            textUpdate.newText
                        );
                    }
                },
                { undoStopBefore: false, undoStopAfter: true }
            )
            .then(result => {
                this.disableHistory = false;
                return result;
            });
    }

    traverse(start: Position, distance: Position): Position {
        if (distance.row === 0) {
            return { row: start.row, column: start.column + distance.column };
        } else {
            return { row: start.row + distance.row, column: distance.column };
        }
    }

    insert(position: Position, text: string): [Position, Position, string] {
        console.log("buffer insert pos:" + position + " text: " + text);
        if (typeof this.onInsert === "function") {
            this.onInsert(position, text);
        }
        return [position, position, text];
    }

    delete(startPosition: Position, extent: Position): [Position, Position, string] {
        console.log("buffer delete start pos:" + startPosition + " extent: " + extent);
        if (typeof this.onDelete === "function") {
            this.onDelete(startPosition, extent);
        }
        const endPosition = this.traverse(startPosition, extent);
        return [startPosition, endPosition, ""];
    }

    createRange(start: Position, end: Position): vscode.Range {
        return new vscode.Range(
            new vscode.Position(start.row, start.column),
            new vscode.Position(end.row, end.column)
        );
    }

    // callback for vscode text editor
    onDidChangeBuffer(changes: vscode.TextDocumentContentChangeEvent[]): void {
        if (this.disableHistory) return;
        changes.forEach(change => {
            const { start, end } = change.range;
            const oldStart = { row: start.line, column: start.character };
            const oldEnd = { row: end.line, column: end.character };
            const newText = change.text;
            this.bufferProxy.setTextInRange(oldStart, oldEnd, newText);
        });
    }

    requestSavePromise(): Promise<void> {
        return new Promise(() => {
            this.bufferProxy.requestSave();
        });
    }

    async save(): Promise<boolean> {
        if (this.buffer.isDirty) return this.buffer.save();
        else return true;
    }
}
