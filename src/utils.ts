import { Position, Range, Selection, TextUdpate } from "@atom/teletype-client";
import * as vscode from "vscode";

export interface TextOperation {
    type: string,
    changes: TextUdpate[],
}

export interface CrdtHisotry {
    baseText: string,
    nextCheckPointId: number,
    undoStack: TextOperation[],
    redoStack: TextOperation[],
}

export function getWholeRange(document: vscode.TextDocument): vscode.Range {
    const firstLine = document.lineAt(0);
    const lastLine = document.lineAt(document.lineCount - 1);
    return new vscode.Range(firstLine.range.start, lastLine.range.end);
}

export function fromVscodePosition(position: vscode.Position): Position {
    return {
        column: position.character,
        row: position.line,
    };
}

export function toVscodePosition(position: Position): vscode.Position {
    return new vscode.Position(position.row, position.column);
}

export function toVscodeRange(range: Range): vscode.Range {
    return new vscode.Range(toVscodePosition(range.start), toVscodePosition(range.end));
}

export function fromSelectionToRange(selection: Selection): Range {
    const {
        range: { end, start },
    } = selection;
    if (selection.reversed) {
        return {
            start: start,
            end: start,
        };
    } else {
        return {
            start: end,
            end: end,
        };
    }
}

export function getHistory(document: vscode.TextDocument, nextCheckPointId: number): CrdtHisotry {
    return {
        baseText: document.getText(),
        nextCheckPointId,
        undoStack: [],
        redoStack: []
    };
}