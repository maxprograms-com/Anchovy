/*******************************************************************************
 * Copyright (c) 2009-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { ipcRenderer, IpcRendererEvent } from "electron";

export class searchReplace {

    private matchFound: boolean = false;

    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            (document.getElementById('theme') as HTMLLinkElement).href = theme;
        });
        ipcRenderer.on('match-found', (event: IpcRendererEvent, found: boolean) => {
            this.matchFound = found;
            this.updateReplaceButtonState();
        });
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Escape') {
                ipcRenderer.send('close-search-replace');
            }
        });
        document.getElementById('find')?.addEventListener('click', () => {
            this.find();
        });
        document.getElementById('findNext')?.addEventListener('click', () => {
            this.findNext();
        });
        document.getElementById('replace')?.addEventListener('click', () => {
            this.replace();
        });
        document.getElementById('replaceAll')?.addEventListener('click', () => {
            this.replaceAll();
        });
        document.getElementById('replaceText')?.addEventListener('input', () => {
            this.updateReplaceButtonState();
        });
        (document.getElementById('searchText') as HTMLInputElement).focus();
        setTimeout(() => {
            ipcRenderer.send('set-height', { window: 'searchReplace', width: document.body.clientWidth, height: document.body.clientHeight });
        }, 200);
    }

    private updateReplaceButtonState(): void {
        (document.getElementById('replace') as HTMLButtonElement).disabled = !this.matchFound;
    }

    private find(): void {
        let args = this.getSearchArgs();
        if (!args.searchText.trim()) {
            ipcRenderer.send('show-message', { group: 'searchReplace', message: 'enterSearchText' });
            return;
        }
        this.matchFound = false;
        this.updateReplaceButtonState();
        ipcRenderer.send('find-text', { searchText: args.searchText, caseSensitive: args.caseSensitive, useRegex: args.useRegex });
        (document.getElementById('find') as HTMLButtonElement).blur();
    }

    private findNext(): void {
        let args = this.getSearchArgs();
        if (!args.searchText.trim()) {
            ipcRenderer.send('show-message', { group: 'searchReplace', message: 'enterSearchText' });
            return;
        }
        this.matchFound = false;
        this.updateReplaceButtonState();
        ipcRenderer.send('find-next-text', { searchText: args.searchText, caseSensitive: args.caseSensitive, useRegex: args.useRegex });
        (document.getElementById('findNext') as HTMLButtonElement).blur();
    }

    private replace(): void {
        let replaceText: string = (document.getElementById('replaceText') as HTMLInputElement).value;
        ipcRenderer.send('replace-current', replaceText);
        (document.getElementById('replaceText') as HTMLButtonElement).blur();
    }

    private replaceAll(): void {
        let args = this.getSearchArgs();
        if (!args.searchText.trim()) {
            ipcRenderer.send('show-message', { group: 'searchReplace', message: 'enterSearchText' });
            return;
        }
        ipcRenderer.send('replace-all', args);
        (document.getElementById('replaceAll') as HTMLButtonElement).blur();
    }

    private getSearchArgs(): { searchText: string, replaceText: string, caseSensitive: boolean, useRegex: boolean } {
        return {
            searchText: (document.getElementById('searchText') as HTMLInputElement).value,
            replaceText: (document.getElementById('replaceText') as HTMLInputElement).value,
            caseSensitive: (document.getElementById('caseSensitive') as HTMLInputElement).checked,
            useRegex: (document.getElementById('regularExpression') as HTMLInputElement).checked
        };
    }
}
