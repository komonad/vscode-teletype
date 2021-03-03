import { Position, Range, Selection } from "@atom/teletype-client";
import * as vscode from "vscode";

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
