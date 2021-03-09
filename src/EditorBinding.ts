import * as vscode from "vscode";

import { EditorDelegate, EditorProxy, Portal, Position, Selection, SelectionMap } from "@atom/teletype-client";

import { fromSelectionToRange, fromVscodePosition, toVscodeRange } from "./utils";

interface SiteDecoration {
    cursorDecoration: vscode.TextEditorDecorationType;
    selectionDecoration: vscode.TextEditorDecorationType;
}

export default class EditorBinding implements EditorDelegate {
    public editor: vscode.TextEditor;
    private portal: Portal;
    private readonly isHost: boolean;
    public editorProxy!: EditorProxy;
    private localSelectionMap: SelectionMap;
    private disposed!: boolean;
    private onDispose: (binding: EditorBinding) => void = () => {};
    private selectionsBySiteId: any;
    private decorationBySiteId: Map<number, SiteDecoration>;
    private localMarkerSelectionMap: Map<number, SelectionMap>;
    private decorationCache?: () => void;

    constructor({ editor, portal, isHost }: { editor: vscode.TextEditor; portal: Portal; isHost: boolean }) {
        this.editor = editor;
        this.portal = portal;
        this.isHost = isHost;
        this.localSelectionMap = {};
        this.selectionsBySiteId = new Map();
        this.decorationBySiteId = new Map();
        this.localMarkerSelectionMap = new Map();
    }

    dispose(): void {
        this.onDispose(this);
        this.disposed = true;
    }

    isDisposed(): boolean {
        return this.disposed;
    }

    onDidDispose(onDispose: (binding: EditorBinding) => void): void {
        this.onDispose = onDispose;
    }

    setEditorProxy(editorProxy: EditorProxy): void {
        this.editorProxy = editorProxy;
    }

    updateSelectionsForSiteId(siteId: number, selectionUpdates: SelectionMap): void {
        console.log("updateSelectionsForSiteID: " + siteId);
        let selectionsForSite = this.localMarkerSelectionMap.get(siteId);
        const selectionMap = { ...selectionsForSite, ...selectionUpdates };
        this.localMarkerSelectionMap.set(siteId, selectionMap);
		
        let selectionRanges: vscode.Range[] = [];
        let cursorRanges: vscode.Range[] = [];

        if (!selectionsForSite) {
            selectionsForSite = {};
            this.selectionsBySiteId[siteId] = selectionsForSite;
        }

        for (const selectionId in selectionUpdates) {
            const selectionUpdate = selectionUpdates[selectionId];
            if (selectionUpdate) {
                selectionsForSite[selectionId] = selectionUpdate;
                if (this.isCursor(selectionUpdate)) {
                    cursorRanges = cursorRanges.concat(toVscodeRange(selectionUpdate.range));
                } else {
                    if (selectionUpdate.tailed) {
                        const cursorRange = fromSelectionToRange(selectionUpdate);
                        cursorRanges = cursorRanges.concat(toVscodeRange(cursorRange));
                    }
                    selectionRanges = selectionRanges.concat(toVscodeRange(selectionUpdate.range));
                }
            } else {
                delete selectionsForSite[selectionId];
            }
        }
        const siteDecoration = this.findSiteDecoration(siteId);
        this.updateDecorations(siteDecoration, cursorRanges, selectionRanges);
    }

    public showDecoration(): void {
        if (this.decorationCache) {
            this.decorationCache();
        }
    }

    private updateDecorations(
        siteDecoration: SiteDecoration,
        cursorRanges: vscode.Range[],
        selectionRanges: vscode.Range[]
    ): void {
        // current editor is disposed
        if (!vscode.window.visibleTextEditors.find(editor => editor == this.editor)) {
            return;
        }
        this.decorationCache = () => {
            const { cursorDecoration, selectionDecoration } = siteDecoration;
            this.editor.setDecorations(cursorDecoration, cursorRanges);
            this.editor.setDecorations(selectionDecoration, selectionRanges);
        };
        this.decorationCache();
    }

    private findSiteDecoration(siteId: number): SiteDecoration {
        let siteDecoration = this.decorationBySiteId.get(siteId);
        if (!siteDecoration) {
            siteDecoration = this.createDecorationFromSiteId(siteId);
            this.decorationBySiteId.set(siteId, siteDecoration);
        }
        return siteDecoration;
    }

    isScrollNeededToViewPosition(_: Position): boolean {
        // TODO
        return false;
    }

    async updateTether(state: number, position?: Position): Promise<void> {
        // TODO
    }

    clearSelectionsForSiteId(siteId: number): void {
        const siteDecoration = this.findSiteDecoration(siteId);
        this.updateDecorations(siteDecoration, [], []);
    }

    updateSelections(selections: vscode.Selection[]): void {
        this.processSelections(selections);
        this.editorProxy.updateSelections(this.localSelectionMap);
    }

    private processSelections(selections: vscode.Selection[]) {
        const currentSelectionKeys = Object.keys(this.localSelectionMap);
        const newSelectionsLength = selections.length;

        selections.forEach((selection, index) => {
            this.localSelectionMap[index] = {
                range: {
                    start: fromVscodePosition(selection.start),
                    end: fromVscodePosition(selection.end),
                },
                reversed: selection.isReversed,
            };
        });

        selections.forEach((selection, _) => {
            if (currentSelectionKeys.length > newSelectionsLength) {
                for (
                    let index = newSelectionsLength;
                    index < currentSelectionKeys.length;
                    index += 1
                ) {
                    this.localSelectionMap[index] = {
                        range: {
                            start: fromVscodePosition(selection.start),
                            end: fromVscodePosition(selection.end),
                        },
                        reversed: false,
                    };
                }
            }
        });
    }

    private createDecorationFromSiteId(siteId: number): SiteDecoration {
        const selectionDecorationRenderOption: vscode.DecorationRenderOptions = {
            backgroundColor: "rgba(61, 90, 254, 0.6)",
        };

        const { login: siteLogin } = this.portal.getSiteIdentity(siteId);

        const nameTagStyleRules = {
            position: "absolute",
            top: "12px",
            padding: "0px 5px 0px 0px",
            display: "inline-block",
            "z-index": 1,
            "border-radius": "20px",
            "font-size": "15px",
            "font-weight": "bold",
        };

        const curosrDecorationRenderOption: vscode.DecorationRenderOptions = {
            border: "solid rgba(122, 34, 210, 0.6)",
            borderWidth: "5px 5px 5px 5px",
            after: {
                contentText: siteLogin,
                backgroundColor: "rgba(122, 34, 210, 0.6)",
                color: "rgba(192, 192, 192, 30)",
                textDecoration: `none; ${this.stringifyCssProperties(nameTagStyleRules)}`,
            },
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        };

        const create = vscode.window.createTextEditorDecorationType;

        return {
            selectionDecoration: create(selectionDecorationRenderOption),
            cursorDecoration: create(curosrDecorationRenderOption),
        };
    }

    private stringifyCssProperties(rules: any) {
        return Object.keys(rules)
            .map(rule => `${rule}: ${rules[rule]};`)
            .join(" ");
    }

    private isCursor(selection: Selection): boolean {
        const { start, end } = selection.range;
        return start.column === end.column && start.row === end.row;
    }
}
