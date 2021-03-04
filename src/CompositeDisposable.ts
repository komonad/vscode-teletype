import { Disposable } from "vscode";

export type DisposableLike = {
    dispose(): void;
}

export class CompositeDisposable {
    disposables: DisposableLike[] = [];
    constructor(...disposables: DisposableLike[]) {
        this.disposables = disposables;
    }

    dispose(): void {
        this.disposables.forEach(x => x.dispose());
    }

    add(...disposables: DisposableLike[]): this {
        this.disposables.push(...disposables);
        return this;
    }

    remove(disposable: DisposableLike): this {
        const idx = this.disposables.findIndex((value) => value === disposable);
        if (idx != -1) {
            this.disposables.splice(idx, 1);
        }
        return this;
    }
}