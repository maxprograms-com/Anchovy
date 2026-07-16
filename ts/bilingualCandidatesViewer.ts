/*******************************************************************************
 * Copyright (c) 2009-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 * Maxprograms - initial API and implementation
 *******************************************************************************/

import { ipcRenderer, IpcRendererEvent } from "electron";

export class BilingualCandidatesViewer {

    srcLang: string = '';
    trgLang: string = '';
    glossmlFile: string = '';

    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            document.getElementById('theme')?.setAttribute('href', theme);
        });
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Escape') {
                ipcRenderer.send('close-bilingualCandidatesViewer');
            }
        });
        ipcRenderer.on('set-bilingual-candidates', (event: IpcRendererEvent, args: { data: string, srcLang: string, trgLang: string, glossmlFile: string }) => {
            this.srcLang = args.srcLang;
            this.trgLang = args.trgLang;
            this.glossmlFile = args.glossmlFile;
            this.showCandidates(args.data);
        });
        window.addEventListener('resize', () => {
            let container: HTMLDivElement = document.getElementById('container') as HTMLDivElement;
            let buttonArea: HTMLDivElement = document.getElementById('buttonArea') as HTMLDivElement;
            container.style.height = (window.innerHeight - buttonArea.clientHeight) + 'px';
        });
        document.getElementById('removeSelected')?.addEventListener('click', () => {
            this.removeSelected();
        });
        document.getElementById('save')?.addEventListener('click', () => {
            this.saveGlossary();
        });
        setTimeout(() => {
            ipcRenderer.send('set-height', { window: 'bilingualCandidatesViewer', height: document.body.clientHeight, width: document.body.clientWidth });
        }, 100);
    }

    showCandidates(data: string): void {
        let lines: string[] = data.split(/\r?\n/);
        let table: HTMLTableElement = document.getElementById('candidatesTable') as HTMLTableElement;
        table.innerHTML = '';
        let header: HTMLTableSectionElement = table.createTHead();
        let headerRow: HTMLTableRowElement = header.insertRow();
        let headers: string[] = lines[0].split(',');
        headers.unshift('\u00A0'); // For checkbox column
        for (let colHeader of headers) {
            let th: HTMLTableCellElement = document.createElement('th');
            th.innerText = colHeader;
            th.classList.add('noWrap');
            headerRow.appendChild(th);
        }
        header.appendChild(headerRow);
        table.appendChild(header);
        let tbody: HTMLTableSectionElement = table.createTBody();
        table.appendChild(tbody);

        for (let i: number = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') {
                continue;
            }
            let cols: string[] = lines[i].split(',');
            let row: HTMLTableRowElement = tbody.insertRow();
            let cell: HTMLTableCellElement = row.insertCell();

            let checkBox: HTMLInputElement = document.createElement('input');
            checkBox.type = 'checkbox';
            checkBox.id = 'pair_' + i;
            cell.classList.add('noWrap');
            cell.appendChild(checkBox);
            for (let col of cols) {
                cell = row.insertCell();
                cell.classList.add('noWrap');
                cell.innerText = col;
            }
        }
    }

    removeSelected(): void {
        let table: HTMLTableElement = document.getElementById('candidatesTable') as HTMLTableElement;
        let tbody: HTMLTableSectionElement = table.tBodies[0];
        let rowsToRemove: HTMLTableRowElement[] = [];
        for (let i: number = 0; i < tbody.rows.length; i++) {
            let row: HTMLTableRowElement = tbody.rows[i];
            let checkBox: HTMLInputElement = row.cells[0].querySelector('input[type="checkbox"]') as HTMLInputElement;
            if (checkBox.checked) {
                rowsToRemove.push(row);
            }
        }
        for (let row of rowsToRemove) {
            tbody.removeChild(row);
        }
    }

    saveGlossary(): void {
        let table: HTMLTableElement = document.getElementById('candidatesTable') as HTMLTableElement;
        let tbody: HTMLTableSectionElement = table.tBodies[0];
        let pairs: { source: string, target: string }[] = [];
        for (let i: number = 0; i < tbody.rows.length; i++) {
            let row: HTMLTableRowElement = tbody.rows[i];
            pairs.push({
                source: row.cells[1].innerText,
                target: row.cells[4].innerText
            });
        }
        let openResult: boolean = (document.getElementById('openResult') as HTMLInputElement).checked;
        ipcRenderer.send('make-bilingual-glossary', { pairs, srcLang: this.srcLang, trgLang: this.trgLang, glossmlFile: this.glossmlFile, openResult });
    }
}
