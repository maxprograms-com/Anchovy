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
import { Preferences } from "./preferences.js";

export class PreferencesDialog {

    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            document.getElementById('theme')?.setAttribute('href', theme);
        });
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Escape') {
                ipcRenderer.send('close-preferencesDialog');
            }
        });
        ipcRenderer.send('get-preferences');
        ipcRenderer.on('set-preferences', (event: IpcRendererEvent, preferences: Preferences) => {
            (document.getElementById('appLangSelect') as HTMLSelectElement).value = preferences.appLang;
            (document.getElementById('themeColor') as HTMLSelectElement).value = preferences.theme;
            (document.getElementById('defaultCatalog') as HTMLInputElement).value = preferences.catalog;
        });
        document.getElementById('browseCatalog')?.addEventListener('click', () => {
            ipcRenderer.send('browse-preferences-catalog');
        });
        ipcRenderer.on('set-preferences-catalog', (event: IpcRendererEvent, filePath: string) => {
            (document.getElementById('defaultCatalog') as HTMLInputElement).value = filePath;
        });
        document.getElementById('save')?.addEventListener('click', () => {
            this.savePreferences();
        });
        setTimeout(() => {
            ipcRenderer.send('set-height', { window: 'preferencesDialog', height: document.body.clientHeight, width: document.body.clientWidth });
        }, 100);
    }

    private savePreferences() {
        const appLang : string= (document.getElementById('appLangSelect') as HTMLSelectElement).value;
        const theme : string = (document.getElementById('themeColor') as HTMLSelectElement).value;
        const catalog : string = (document.getElementById('defaultCatalog') as HTMLInputElement).value;
        let preferences: Preferences = {
            appLang,
            theme: theme as "system" | "light" | "dark" | "highcontrast",
            catalog
        };
        ipcRenderer.send('save-preferences', preferences);
    }
}




