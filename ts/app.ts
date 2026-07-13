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

import { app, BrowserWindow, dialog, ipcMain, IpcMainEvent, Menu, MenuItem, MessageBoxReturnValue, nativeTheme, net, session, shell } from 'electron';
import { IncomingMessage } from 'electron/main';
import { spawnSync, SpawnSyncReturns } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Language, LanguageUtils } from 'typesbcp47';
import { ExcelReader, ExcelSheetData } from 'typesexcel';
import { BilingualExtraction, TermExtractor } from 'typesterms';
import { XliffDocument, XliffParser } from 'typesxliff';
import { Indenter, TextNode, XMLAttribute, XMLDeclaration, XMLDocument, XMLElement, XMLWriter } from 'typesxml';
import { CsvImporter } from './csv/csvImporter.js';
import { columnsConsistent, CsvEncoding, CsvReader, detectCsvSettings } from './csv/csvReader.js';
import { I18n } from "./i18n.js";
import { Column, ColumnTypes } from './model/columnTypes.js';
import { ExcelColumnMapping, ExcelImporter } from './model/excelImporter.js';
import { GlossaryComment } from './model/glossaryComment.js';
import { GlossaryModel } from './model/glossaryModel.js';
import { Pair } from './pair.js';
import { Preferences } from './preferences.js';
import { TBX2GlossML } from './tbx/tbx2glossml.js';
import { TMX2GlossML } from './tmx/tmx2glossml.js';

class Anchovy {

    readonly ROWSLOAD: number = 300;

    mainWindow: BrowserWindow | null = null;
    extractTermsWindow: BrowserWindow | null = null;
    bilingualExtractTermsWindow: BrowserWindow | null = null;
    aboutWindow: BrowserWindow | null = null;
    systemInfoWindow: BrowserWindow | null = null;
    changeLanguagesWindow: BrowserWindow | null = null;
    preferencesDialogWindow: BrowserWindow | null = null;
    licensesWindow: BrowserWindow | null = null;
    htmlViewerWindow: BrowserWindow | null = null;
    addColumnWindow: BrowserWindow | null = null;
    updatesWindow: BrowserWindow | null = null;
    searchReplaceWindow: BrowserWindow | null = null;
    candidatesViewerWindow: BrowserWindow | null = null;
    bilingualCandidatesViewerWindow: BrowserWindow | null = null;
    glossaryInfoWindow: BrowserWindow | null = null;
    importExcelWindow: BrowserWindow | null = null;
    importCsvWindow: BrowserWindow | null = null;
    tmxToGlossMLWindow: BrowserWindow | null = null;
    tbxToGlossMLWindow: BrowserWindow | null = null;
    newGlossaryWindow: BrowserWindow | null = null;

    pendingExcelFile: string = '';
    pendingExcelSheets: ExcelSheetData[] = [];
    pendingCsvFile: string = '';

    static appLang: string = 'en';
    static i18n: I18n;

    currentFile: string;
    model: GlossaryModel | null = null;
    srcLang: string = '';
    columns: Column[] = [];
    sortColumnType: ColumnTypes | null = null;
    sortColumnLang: string | undefined = undefined;
    sortAscending: boolean = true;
    currentPreferences: Preferences;
    currentTheme: string;
    latestVersion: string = '';
    downloadLink: string = '';

    constructor() {
        this.loadPreferences();
        Anchovy.i18n = new I18n(join(dirname(fileURLToPath(import.meta.url)), '../i18n/anchovy_' + Anchovy.appLang + '.json'));
        this.currentFile = '';
        app.whenReady().then(() => {
            this.createWindow();
        });
        app.on('window-all-closed', () => {
            app.quit();
        });
        app.on('before-quit', (event: Electron.Event) => {
            this.beforeQuit(event);
        });
        ipcMain.on('new-glossary', () => {
            this.newFile();
        });
        ipcMain.on('open-glossary', () => {
            this.showOpenFileDialog();
        });
        ipcMain.on('get-rows', (event: IpcMainEvent, arg: { start: number, count: number, scroll: boolean }) => {
            this.getRows(arg.start, arg.count, arg.scroll);
        })
        ipcMain.on('save-glossary', () => {
            this.saveFile();
        });
        ipcMain.on('file-properties', () => {
            this.showFileProperties();
        });
        ipcMain.on('add-column-dialog', () => {
            this.showAddColumnDialog();
        });
        ipcMain.on('term-extraction', () => {
            this.termExtraction();
        });
        ipcMain.on('bilingual-term-extraction', () => {
            this.bilingualTermExtraction();
        });
        ipcMain.on('close-bilingualExtractTerms', () => {
            if (this.bilingualExtractTermsWindow && !this.bilingualExtractTermsWindow.isDestroyed()) {
                this.bilingualExtractTermsWindow.close();
            }
        });
        ipcMain.on('browse-bilingual-xliff', () => {
            this.browseBilingualXliff();
        });
        ipcMain.on('browse-bilingual-glossml-target', (event: IpcMainEvent, defaultPath: string) => {
            this.browseGlossmlTarget(this.bilingualExtractTermsWindow, defaultPath);
        });
        ipcMain.on('extract-bilingual-candidates', (event: IpcMainEvent, args: { xliffFile: string, frequency: number, termLength: number, glossmlFile: string }) => {
            this.extractBilingualCandidates(args.xliffFile, args.frequency, args.termLength, args.glossmlFile);
        });
        ipcMain.on('close-bilingualCandidatesViewer', () => {
            if (this.bilingualCandidatesViewerWindow && !this.bilingualCandidatesViewerWindow.isDestroyed()) {
                this.bilingualCandidatesViewerWindow.close();
            }
        });
        ipcMain.on('make-bilingual-glossary', (event: IpcMainEvent, args: { pairs: { source: string, target: string }[], srcLang: string, trgLang: string, glossmlFile: string, openResult: boolean }) => {
            this.createBilingualGlossary(args.pairs, args.srcLang, args.trgLang, args.glossmlFile, args.openResult);
        });
        ipcMain.on('export-tmx', () => {
            this.exportTMX();
        });
        ipcMain.on('export-csv', () => {
            this.exportCSV();
        });
        ipcMain.on('export-excel', () => {
            this.exportExcel();
        });
        ipcMain.on('export-html', () => {
            this.exportHTML();
        });
        ipcMain.on('export-tbx', () => {
            this.exportTBX();
        });
        ipcMain.on('change-languages', () => {
            this.changeLanguages();
        });
        ipcMain.on('close-changeLanguages', () => {
            if (this.changeLanguagesWindow && !this.changeLanguagesWindow.isDestroyed()) {
                this.changeLanguagesWindow.close();
            }
        });
        ipcMain.on('save-languages', (event: IpcMainEvent, args: { oldLanguage: string, newLanguage: string }) => {
            this.saveLanguages(args);
        });
        ipcMain.on('close-candidatesViewer', () => {
            if (this.candidatesViewerWindow && !this.candidatesViewerWindow.isDestroyed()) {
                this.candidatesViewerWindow.close();
            }
        });
        ipcMain.on('user-guide', () => {
            Anchovy.showHelp();
        });
        ipcMain.on('close-updates', () => {
            if (this.updatesWindow && !this.updatesWindow.isDestroyed()) {
                this.updatesWindow.close();
            }
        });
        ipcMain.on('get-versions', (event: IpcMainEvent) => {
            event.sender.send('set-versions', { current: app.getVersion(), latest: this.latestVersion });
        });
        ipcMain.on('release-history', () => {
            this.showReleaseHistory();
        });
        ipcMain.on('download-latest', () => {
            this.downloadLatest();
        });
        ipcMain.on('set-height', (event: IpcMainEvent, args: { window: string, height: number, width: number }) => {
            this.setHeight(args);
        });
        nativeTheme.on('updated', () => {
            this.loadPreferences();
            this.setTheme();
            this.createMenu();
        });
        ipcMain.on('get-preferences', (event: IpcMainEvent) => {
            event.sender.send('set-preferences', this.currentPreferences);
        });
        ipcMain.on('save-preferences', (event: IpcMainEvent, preferences: Preferences) => {
            this.currentPreferences = preferences;
            this.savePreferences(preferences);
        });
        ipcMain.on('close-preferencesDialog', () => {
            if (this.preferencesDialogWindow && !this.preferencesDialogWindow.isDestroyed()) {
                this.preferencesDialogWindow.close();
            }
        });
        ipcMain.on('browse-preferences-catalog', () => {
            this.browsePreferencesCatalog();
        });
        ipcMain.on('get-theme', (event: IpcMainEvent) => {
            event.sender.send('set-theme', this.currentTheme);
        });
        ipcMain.on('get-languages', (event: IpcMainEvent) => {
            this.getLanguages(event);
        });
        ipcMain.on('get-existing-languages', (event: IpcMainEvent) => {
            this.getExistingLanguages(event);
        });
        ipcMain.on('get-source-languages', (event: IpcMainEvent) => {
            this.getSourceLanguages(event);
        });
        ipcMain.on('save-glossary-info', (event: IpcMainEvent, args: { srcLang: string, comment: string }) => {
            this.saveGlossaryInfo(args);
        });
        ipcMain.on('create-glossary', (event: IpcMainEvent, srcLang: string) => {
            this.makeNewGlossary(srcLang);
        });
        ipcMain.on('close-newGlossary', () => {
            if (this.newGlossaryWindow && !this.newGlossaryWindow.isDestroyed()) {
                this.newGlossaryWindow.close();
            }
        });
        ipcMain.on('get-fileTypes', (event: IpcMainEvent) => {
            this.getTypes(event);
        });
        ipcMain.on('get-charsets', (event: IpcMainEvent) => {
            this.getCharsets(event);
        });
        ipcMain.on('browse-source-file', () => {
            this.browseSourceFile();
        });
        ipcMain.on('show-error', (event: IpcMainEvent, arg: { group: string, message: string }) => {
            dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), Anchovy.i18n.getString(arg.group, arg.message));
        });
        ipcMain.on('browse-terms-glossml-target', (event: IpcMainEvent, defaultPath: string) => {
            this.browseGlossmlTarget(this.extractTermsWindow, defaultPath);
        });
        ipcMain.on('extract-candidates', (event: IpcMainEvent, args: { sourceFile: string, fileType: string, encoding: string, language: string, frequency: number, termLength: number, glossmlFile: string }) => {
            if (!existsSync(args.sourceFile)) {
                dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), Anchovy.i18n.getString('Anchovy', 'sourceFileNotFound'));
                return;
            }
            this.extractTermsWindow.close();
            setTimeout(() => {
                this.extractCandidateTerms(args.sourceFile, args.fileType, args.encoding, args.language, args.frequency, args.termLength, args.glossmlFile);
            }, 300);
        });
        ipcMain.on('make-glossary', (event: IpcMainEvent, args: { terms: string[], srcLang: string, glossmlFile: string, openResult: boolean }) => {
            this.createGlossary(args.terms, args.srcLang, args.glossmlFile, args.openResult);
        });
        ipcMain.on('close-extractTerms', () => {
            if (this.extractTermsWindow && !this.extractTermsWindow.isDestroyed()) {
                this.extractTermsWindow.close();
            }
        });
        ipcMain.on('show-licenses', (event: IpcMainEvent, from: string) => {
            this.showLicenses(from);
        });
        ipcMain.on('close-licenses', () => {
            if (this.licensesWindow && !this.licensesWindow.isDestroyed()) {
                this.licensesWindow.close();
            }
        });
        ipcMain.on('open-license', (event: IpcMainEvent, type: string) => {
            this.openLicense(type);
        });
        ipcMain.on('close-about', () => {
            if (this.aboutWindow && !this.aboutWindow.isDestroyed()) {
                this.aboutWindow.close();
            }
        });
        ipcMain.on('show-system-info', () => {
            this.showSystemInfo();
        });
        ipcMain.on('close-systemInfo', () => {
            if (this.systemInfoWindow && !this.systemInfoWindow.isDestroyed()) {
                this.systemInfoWindow.close();
            }
        });
        ipcMain.on('get-system-info', (event: IpcMainEvent) => {
            event.sender.send('set-system-info', this.getSystemInfo());
        });
        ipcMain.on('get-glossary-info', () => {
            this.getGlossaryInfo();
        });
        ipcMain.on('add-column', (event: IpcMainEvent, args: { comment: boolean, term: boolean, definition: boolean, language: string }) => {
            this.addColumn(args);
        });
        ipcMain.on('remove-column', (event: IpcMainEvent, colIndex: number) => {
            this.removeColumn(colIndex);
        });
        ipcMain.on('show-message', (event: IpcMainEvent, arg: { group: string, message: string }) => {
            dialog.showMessageBox({
                type: 'warning',
                message: Anchovy.i18n.getString(arg.group, arg.message)
            });
        });
        ipcMain.on('close-addColumn', () => {
            if (this.addColumnWindow && !this.addColumnWindow.isDestroyed()) {
                this.addColumnWindow.close();
            }
        });
        ipcMain.on('close-importExcel', () => {
            if (this.importExcelWindow && !this.importExcelWindow.isDestroyed()) {
                this.importExcelWindow.close();
            }
        });
        ipcMain.on('do-excel-import', (event: IpcMainEvent, args: { glossmlFile: string, sheetIndex: number, hasHeaderRow: boolean, sourceLanguage: string, columns: { action: string, lang?: string }[], openResult: boolean }) => {
            this.doExcelImport(args);
        });
        ipcMain.on('browse-excel-source', () => {
            this.browseExcelSource();
        });
        ipcMain.on('close-importCsv', () => {
            if (this.importCsvWindow && !this.importCsvWindow.isDestroyed()) {
                this.importCsvWindow.close();
            }
        });
        ipcMain.on('browse-csv-source', () => {
            this.browseCsvSource();
        });
        ipcMain.on('get-csv-preview', (event: IpcMainEvent, args: { encoding: CsvEncoding, columnSeparator: string, textDelimiter: string }) => {
            this.getCsvPreview(event, args);
        });
        ipcMain.on('do-csv-import', (event: IpcMainEvent, args: { glossmlFile: string, encoding: CsvEncoding, columnSeparator: string, textDelimiter: string, hasHeaderRow: boolean, sourceLanguage: string, columns: { action: string, lang?: string }[], openResult: boolean }) => {
            this.doCsvImport(args);
        });
        ipcMain.on('close-tmxToGlossML', () => {
            if (this.tmxToGlossMLWindow && !this.tmxToGlossMLWindow.isDestroyed()) {
                this.tmxToGlossMLWindow.close();
            }
        });
        ipcMain.on('browse-tmx-source', () => {
            this.browseTmxSource();
        });
        ipcMain.on('browse-tmx-glossml-target', (event: IpcMainEvent, defaultPath: string) => {
            this.browseGlossmlTarget(this.tmxToGlossMLWindow, defaultPath);
        });
        ipcMain.on('close-tbxToGlossML', () => {
            if (this.tbxToGlossMLWindow && !this.tbxToGlossMLWindow.isDestroyed()) {
                this.tbxToGlossMLWindow.close();
            }
        });
        ipcMain.on('browse-tbx-source', () => {
            this.browseTbxSource();
        });
        ipcMain.on('browse-tbx-glossml-target', (event: IpcMainEvent, defaultPath: string) => {
            this.browseGlossmlTarget(this.tbxToGlossMLWindow, defaultPath);
        });
        ipcMain.on('browse-csv-glossml-target', (event: IpcMainEvent, defaultPath: string) => {
            this.browseGlossmlTarget(this.importCsvWindow, defaultPath);
        });
        ipcMain.on('browse-excel-glossml-target', (event: IpcMainEvent, defaultPath: string) => {
            this.browseGlossmlTarget(this.importExcelWindow, defaultPath);
        });
        ipcMain.on('convert-tmx-to-glossml', (event: IpcMainEvent, args: { tmxFile: string, glossmlFile: string, openResult: boolean }) => {
            this.convertTmxToGlossML(args);
        });
        ipcMain.on('convert-tbx-to-glossml', (event: IpcMainEvent, args: { tbxFile: string, glossmlFile: string, openResult: boolean }) => {
            this.convertTbxToGlossML(args);
        });
        ipcMain.on('replace-text-dialog', () => {
            this.replaceTextDialog();
        });
        ipcMain.on('close-search-replace', () => {
            if (this.searchReplaceWindow && !this.searchReplaceWindow.isDestroyed()) {
                this.searchReplaceWindow.close();
            }
        });
        ipcMain.on('find-text', (event: IpcMainEvent, args: { searchText: string, caseSensitive: boolean, useRegex: boolean }) => {
            this.findText(args);
        });
        ipcMain.on('find-next-text', (event: IpcMainEvent, args: { searchText: string, caseSensitive: boolean, useRegex: boolean }) => {
            this.findNextText(args);
        });
        ipcMain.on('search-start', (event: IpcMainEvent, arg: { searchText: string, caseSensitive: boolean, useRegex: boolean, row: number, column: number }) => {
            this.searchStartReceived(arg.searchText, arg.caseSensitive, arg.useRegex, arg.row, arg.column);
        });
        ipcMain.on('match-found-notification', (event: IpcMainEvent, found: boolean) => {
            this.searchReplaceWindow?.webContents.send('match-found', found);
        });
        ipcMain.on('replace-current', (event: IpcMainEvent, replaceText: string) => {
            this.replaceCurrent(replaceText);
        });
        ipcMain.on('replace-all', (event: IpcMainEvent, args: { searchText: string, replaceText: string, caseSensitive: boolean, useRegex: boolean }) => {
            this.replaceAll(args);
        });
        ipcMain.on('get-version', (event: IpcMainEvent) => {
            event.sender.send('set-version', app.name + ' ' + app.getVersion());
        });
        ipcMain.on('add-row', (event: IpcMainEvent, args: { afterEntryId: string | null, colIndex: number }) => {
            this.addRow(args);
        });
        ipcMain.on('sort-column', (event: IpcMainEvent, args: { colIndex: number }) => {
            this.sortColumn(args.colIndex);
        });
        ipcMain.on('remove-row', (event: IpcMainEvent, arg: { entryId: number, start: number }) => {
            this.removeRow(arg.entryId, arg.start);
        });
        ipcMain.on('save-data', (event: IpcMainEvent, arg: { entryId: number, colIndex: number, value: string }) => {
            if (!this.model) {
                return;
            }
            this.model.updateCell(arg.entryId, this.columns[arg.colIndex], arg.value);
            this.markModified();
        });
    }

    setTheme(): void {
        let windows: BrowserWindow[] = BrowserWindow.getAllWindows();
        for (let window of windows) {
            window.webContents.send('set-theme', this.currentTheme);
        }
    }

    loadPreferences(): void {
        let preferencesFile: string = join(app.getPath('appData'), app.name, 'preferences.json');
        if (!existsSync(preferencesFile)) {
            this.currentPreferences = {
                appLang: 'en',
                theme: 'system',
                catalog: join(app.getAppPath(), 'catalog', 'catalog.xml')
            };
            this.savePreferences(this.currentPreferences);
        }
        try {
            let data: Buffer = readFileSync(preferencesFile);
            this.currentPreferences = JSON.parse(data.toString());
        } catch (err) {
            console.error(err);
        }

        if (this.currentPreferences.appLang) {
            if (app.isReady() && this.currentPreferences.appLang !== Anchovy.appLang) {
                dialog.showMessageBox({
                    type: 'question',
                    message: Anchovy.i18n.getString('Anchovy', 'languageChanged'),
                    buttons: [Anchovy.i18n.getString('Anchovy', 'restart'), Anchovy.i18n.getString('Anchovy', 'dismiss')],
                    cancelId: 1
                }).then((value: MessageBoxReturnValue) => {
                    if (value.response == 0) {
                        app.relaunch();
                        app.quit();
                    }
                });
            }
        } else {
            this.currentPreferences.appLang = 'en';
        }
        Anchovy.appLang = this.currentPreferences.appLang;
        let light: string = 'file://' + join(app.getAppPath(), 'css', 'light.css');
        let dark: string = 'file://' + join(app.getAppPath(), 'css', 'dark.css');
        let highcontrast: string = 'file://' + join(app.getAppPath(), 'css', 'highcontrast.css');
        if (this.currentPreferences.theme === 'system') {
            if (nativeTheme.shouldUseDarkColors) {
                this.currentTheme = dark;
            } else {
                this.currentTheme = light;
            }
            if (nativeTheme.shouldUseHighContrastColors) {
                this.currentTheme = highcontrast;
            }
        }
        if (this.currentPreferences.theme === 'dark') {
            this.currentTheme = dark;
        }
        if (this.currentPreferences.theme === 'light') {
            this.currentTheme = light;
        }
        if (this.currentPreferences.theme === 'highcontrast') {
            this.currentTheme = highcontrast;
        }
        this.setTheme();
    }

    savePreferences(preferences: Preferences): void {
        let dataFolder: string = join(app.getPath('appData'), app.name);
        if (!existsSync(dataFolder)) {
            mkdirSync(dataFolder, { recursive: true });
        }
        let preferencesFile: string = join(app.getPath('appData'), app.name, 'preferences.json');
        writeFileSync(preferencesFile, JSON.stringify(preferences, null, 2));
        if (this.preferencesDialogWindow && !this.preferencesDialogWindow.isDestroyed()) {
            this.preferencesDialogWindow.close();
        }
        this.loadPreferences();
    }

    createWindow(): void {
        this.mainWindow = new BrowserWindow({
            minHeight: 400,
            minWidth: 600,
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            icon: join(app.getAppPath(), 'images', 'anchovy.png'),
            show: false
        });
        this.mainWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/index.html'));
        this.mainWindow.on('close', (event: Electron.Event) => {
            if (this.model && !this.closeFile()) {
                event.preventDefault();
            }
        });
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow?.show();
            setTimeout(() => {
                this.checkUpdates(true);
            }, 800);
        });
        this.createMenu();
    }

    createMenu(): void {
        const iconFolder: string = nativeTheme.shouldUseHighContrastColors ? 'dark' : (nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
        let fileMenu: Menu = Menu.buildFromTemplate([
            { label: Anchovy.i18n.getString('menu', 'newGlossary'), accelerator: 'CmdOrCtrl+N', click: () => { this.newFile(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'new.png') },
            { label: Anchovy.i18n.getString('menu', 'openGlossary'), accelerator: 'CmdOrCtrl+O', click: () => { this.showOpenFileDialog(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'open.png') },
            { label: Anchovy.i18n.getString('menu', 'saveGlossary'), accelerator: 'CmdOrCtrl+S', click: () => { this.saveFile(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'save.png') },
            { label: Anchovy.i18n.getString('menu', 'saveGlossaryAs'), accelerator: 'CmdOrCtrl+Shift+S', click: () => { this.saveFileAs(); } },
            { label: Anchovy.i18n.getString('menu', 'closeGlossary'), accelerator: 'CmdOrCtrl+W', click: () => { this.closeFile(); } },
            new MenuItem({ type: 'separator' }),
            { label: Anchovy.i18n.getString('menu', 'fileProperties'), click: () => { this.showFileProperties(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'info.png') },
            new MenuItem({ type: 'separator' }),
            { label: Anchovy.i18n.getString('menu', 'exportHTML'), click: () => { this.exportHTML(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'exportHTML.png') },
            { label: Anchovy.i18n.getString('menu', 'exportTMX'), click: () => { this.exportTMX(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'exportTMX.png') },
            { label: Anchovy.i18n.getString('menu', 'exportTBX'), click: () => { this.exportTBX(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'exportTBX.png') },
            { label: Anchovy.i18n.getString('menu', 'exportCSV'), click: () => { this.exportCSV(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'exportCSV.png') },
            { label: Anchovy.i18n.getString('menu', 'exportExcel'), click: () => { this.exportExcel(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'excel.png') }
        ]);
        let recentFiles: string[] = this.getRecentFiles();
        if (recentFiles.length > 0) {
            fileMenu.append(new MenuItem({ type: 'separator' }));
            for (let file of recentFiles) {
                fileMenu.append(new MenuItem({ label: file, click: () => { this.openFile(file); } }));
            }
        }

        let editMenu: Menu = Menu.buildFromTemplate([
            { label: Anchovy.i18n.getString('menu', 'undo'), accelerator: 'CmdOrCtrl+Z', click: () => { Anchovy.undo(); } },
            new MenuItem({ type: 'separator' }),
            { label: Anchovy.i18n.getString('menu', 'cut'), accelerator: 'CmdOrCtrl+X', click: () => { Anchovy.cut() } },
            { label: Anchovy.i18n.getString('menu', 'copy'), accelerator: 'CmdOrCtrl+C', click: () => { Anchovy.copy(); } },
            { label: Anchovy.i18n.getString('menu', 'paste'), accelerator: 'CmdOrCtrl+V', click: () => { Anchovy.paste() } },
            { label: Anchovy.i18n.getString('menu', 'selectAll'), accelerator: 'CmdOrCtrl+A', click: () => { Anchovy.selectAll(); } },
            { label: Anchovy.i18n.getString('menu', 'replaceText'), accelerator: 'CmdOrCtrl+F', click: () => { this.replaceTextDialog(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'searchReplace.png') },
            new MenuItem({ type: 'separator' }),
            { label: Anchovy.i18n.getString('menu', 'addRow'), accelerator: 'CmdOrCtrl+Plus', click: () => { this.mainWindow?.webContents.send('add-row-request'); }, icon: join(app.getAppPath(), 'images', iconFolder, 'addRow.png') },
            { label: Anchovy.i18n.getString('menu', 'deleteRow'), accelerator: 'CmdOrCtrl+-', click: () => { this.mainWindow?.webContents.send('delete-row'); }, icon: join(app.getAppPath(), 'images', iconFolder, 'removeRow.png') },
            new MenuItem({ type: 'separator' }),
            { label: Anchovy.i18n.getString('menu', 'addColumn'), accelerator: 'CmdOrCtrl+Alt+Plus', click: () => { this.showAddColumnDialog(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'addColumn.png') },
            { label: Anchovy.i18n.getString('menu', 'deleteColumn'), accelerator: 'CmdOrCtrl+Alt+-', click: () => { this.mainWindow?.webContents.send('delete-column'); }, icon: join(app.getAppPath(), 'images', iconFolder, 'removeColumn.png') },
            new MenuItem({ type: 'separator' })
        ]);
        let viewMenu: Menu = Menu.buildFromTemplate([
            new MenuItem({ label: Anchovy.i18n.getString('menu', 'toggleFullScreen'), role: 'togglefullscreen' })
        ]);
        if (!app.isPackaged) {
            viewMenu.append(new MenuItem({ label: Anchovy.i18n.getString('menu', 'toggleDevTools'), accelerator: 'F12', click: () => { BrowserWindow.getFocusedWindow()?.webContents.openDevTools() } }));
        }
        let tasksMenu: Menu = Menu.buildFromTemplate([
            { label: Anchovy.i18n.getString('menu', 'changeLanguages'), click: () => { this.changeLanguages(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'languages.png') },
            new MenuItem({ type: 'separator' }),
            { label: Anchovy.i18n.getString('menu', 'termExtraction'), click: () => { this.termExtraction(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'termExtraction.png') },
            { label: Anchovy.i18n.getString('menu', 'bilingualTermExtraction'), click: () => { this.bilingualTermExtraction(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'bilingualExtraction.png') },
            new MenuItem({ type: 'separator' }),
            { label: Anchovy.i18n.getString('menu', 'TMXtoGlossML'), click: () => { this.TMXtoGlossML(); } },
            { label: Anchovy.i18n.getString('menu', 'TBXtoGlossML'), click: () => { this.TBXtoGlossML(); } },
            { label: Anchovy.i18n.getString('menu', 'CSVtoGlossML'), click: () => { this.CSVtoGlossML(); } },
            { label: Anchovy.i18n.getString('menu', 'ExcelToGlossML'), click: () => { this.ExcelToGlossML(); } }
        ]);
        let helpMenu: Menu = Menu.buildFromTemplate([
            { label: Anchovy.i18n.getString('menu', 'userGuide'), accelerator: 'F1', click: () => { Anchovy.showHelp(); }, icon: join(app.getAppPath(), 'images', iconFolder, 'help.png') },
            { label: Anchovy.i18n.getString('menu', 'glossml'), click: () => { Anchovy.showGlosML(); } },
            new MenuItem({ type: 'separator' }),
            { label: Anchovy.i18n.getString('menu', 'checkUpdates'), click: () => { this.checkUpdates(false); } },
            { label: Anchovy.i18n.getString('menu', 'viewLicenses'), click: () => { this.showLicenses('main'); } },
            new MenuItem({ type: 'separator' }),
            { label: Anchovy.i18n.getString('menu', 'releaseHistory'), click: () => { this.showReleaseHistory(); } },
            { label: Anchovy.i18n.getString('menu', 'supportGroup'), click: () => { this.showSupportGroup(); } }
        ]);

        let template: MenuItem[] = [
            new MenuItem({ label: Anchovy.i18n.getString('menu', 'fileMenu'), role: 'fileMenu', submenu: fileMenu }),
            new MenuItem({ label: Anchovy.i18n.getString('menu', 'editMenu'), role: 'editMenu', submenu: editMenu }),
            new MenuItem({ label: Anchovy.i18n.getString('menu', 'viewMenu'), role: 'viewMenu', submenu: viewMenu }),
            new MenuItem({ label: Anchovy.i18n.getString('menu', 'tasksMenu'), submenu: tasksMenu }),
            new MenuItem({ label: Anchovy.i18n.getString('menu', 'helpMenu'), role: 'help', submenu: helpMenu })
        ];

        if (process.platform === 'darwin') {
            let appleMenu: Menu = Menu.buildFromTemplate([
                new MenuItem({ label: Anchovy.i18n.getString('menu', 'about'), click: () => { this.showAbout(); } }),
                new MenuItem({
                    label: Anchovy.i18n.getString('menu', 'preferencesMac'), submenu: [
                        { label: Anchovy.i18n.getString('menu', 'settingsMac'), accelerator: 'Cmd+,', click: () => { this.showSettings(); } }
                    ]
                }),
                new MenuItem({ type: 'separator' }),
                new MenuItem({
                    label: Anchovy.i18n.getString('menu', 'services'), role: 'services', submenu: [
                        { label: Anchovy.i18n.getString('menu', 'noServices'), enabled: false }
                    ]
                }),
                new MenuItem({ type: 'separator' }),
                new MenuItem({ label: Anchovy.i18n.getString('menu', 'quitMac'), accelerator: 'Cmd+Q', role: 'quit', click: () => { app.quit(); } })
            ]);
            template.unshift(new MenuItem({ label: 'Anchovy', role: 'appMenu', submenu: appleMenu }));
        } else {
            let help: MenuItem = template.pop();
            template.push(new MenuItem({
                label: Anchovy.i18n.getString('menu', 'settingsMenu'), submenu: [
                    { label: Anchovy.i18n.getString('menu', 'preferences'), click: () => { this.showSettings(); } }
                ]
            }));
            template.push(help);
        }
        if (process.platform === 'win32') {
            template[0].submenu.append(new MenuItem({ type: 'separator' }));
            template[0].submenu.append(new MenuItem({ label: Anchovy.i18n.getString('menu', 'quitWindows'), accelerator: 'Alt+F4', role: 'quit', click: () => { app.quit(); } }));
            template[5].submenu.append(new MenuItem({ type: 'separator' }));
            template[5].submenu.append(new MenuItem({ label: Anchovy.i18n.getString('menu', 'about'), click: () => { this.showAbout(); } }));
        }
        if (process.platform === 'linux') {
            template[0].submenu.append(new MenuItem({ type: 'separator' }));
            template[0].submenu.append(new MenuItem({ label: Anchovy.i18n.getString('menu', 'quitLinux'), accelerator: 'Ctrl+Q', role: 'quit', click: () => { app.quit(); } }));
            template[5].submenu.append(new MenuItem({ type: 'separator' }));
            template[5].submenu.append(new MenuItem({ label: Anchovy.i18n.getString('menu', 'about'), click: () => { this.showAbout(); } }));
        }
        Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    }

    showLicenses(from: string) {
        let parent: BrowserWindow = from === 'about' ? this.aboutWindow : this.mainWindow;
        this.licensesWindow = new BrowserWindow({
            parent: parent,
            width: 400,
            height: 500,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.licensesWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/licenses.html'));
        this.licensesWindow.once('ready-to-show', () => {
            this.licensesWindow?.show();
        });
        this.licensesWindow.on('closed', () => {
            parent?.focus();
        });
        this.licensesWindow.setMenu(null);
    }

    openLicense(type: string) {
        let licenseFile = '';
        let title = '';
        switch (type) {
            case 'Anchovy':
                licenseFile = 'Anchovy.txt';
                title = 'Anchovy License';
                break;
            case "OpenXLIFF":
            case "TypesBCP47":
            case "TypesExcel":
            case "TypesTerms":
            case "TypesXML":
            case "TypesXLIFF":
                licenseFile = 'EclipsePublicLicense1.0.html';
                title = 'Eclipse Public License 1.0';
                break;
            case "BCP47J":
                licenseFile = 'bcp47j.html';
                title = 'Custom License';
                break;
            case "XMLJava":
                licenseFile = 'xmljava.html';
                title = 'Custom License';
                break;
            case "electron":
                licenseFile = 'electron.txt';
                title = 'MIT License';
                break;
            case "Java":
                licenseFile = 'java.html';
                title = 'GPL2 with Classpath Exception';
                break;
            case "jsoup":
                licenseFile = 'jsoup.txt';
                title = 'MIT License';
                break;
            default:
                dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), Anchovy.i18n.getString('Anchovy', 'unknownLicense'));
                return;
        }
        let filePath = join(app.getAppPath(), 'html', 'licenses', licenseFile);
        let fileUrl: URL = new URL('file://' + filePath);

        if (!this.htmlViewerWindow || this.htmlViewerWindow.isDestroyed()) {
            this.htmlViewerWindow = new BrowserWindow({
                parent: this.licensesWindow,
                width: 680,
                height: 400,
                show: false,
                title: title,
                icon: join(app.getAppPath(), 'images', 'Anchovy.png'),
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });
            this.htmlViewerWindow.setMenu(null);
            this.htmlViewerWindow.loadURL(fileUrl.href);
            this.htmlViewerWindow.once('ready-to-show', () => {
                this.htmlViewerWindow.show();
            });
            this.htmlViewerWindow.on('close', () => {
                this.licensesWindow?.focus();
                this.htmlViewerWindow.destroy();
                this.htmlViewerWindow = null;
            });
        } else {
            this.htmlViewerWindow.loadURL(fileUrl.href);
            this.htmlViewerWindow.setTitle(title);
            this.htmlViewerWindow.focus();
        }
    }

    static undo(): void {
        let focusedWindow: BrowserWindow | null = BrowserWindow.getFocusedWindow();
        if (focusedWindow) {
            focusedWindow.webContents.undo();
        }
    }

    static cut(): void {
        let focusedWindow: BrowserWindow | null = BrowserWindow.getFocusedWindow();
        if (focusedWindow) {
            focusedWindow.webContents.cut();
        }
    }

    static copy(): void {
        let focusedWindow: BrowserWindow | null = BrowserWindow.getFocusedWindow();
        if (focusedWindow) {
            focusedWindow.webContents.copy();
        }
    }

    static paste(): void {
        let focusedWindow: BrowserWindow | null = BrowserWindow.getFocusedWindow();
        if (focusedWindow) {
            focusedWindow.webContents.paste();
        }
    }

    static selectAll(): void {
        let focusedWindow: BrowserWindow | null = BrowserWindow.getFocusedWindow();
        if (focusedWindow) {
            focusedWindow.webContents.selectAll();
        }
    }

    showReleaseHistory(): void {
        shell.openExternal('https://maxprograms.com/products/anchovylog.html').catch((reason: any) => {
            if (reason instanceof Error) {
                console.error(reason.message);
            }
            dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), Anchovy.i18n.getString('Anchovy', 'unableToOpenReleaseHistory'));
        });
    }

    showSupportGroup(): void {
        shell.openExternal('https://groups.io/g/maxprograms/').catch((reason: any) => {
            if (reason instanceof Error) {
                console.error(reason.message);
            }
            dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), Anchovy.i18n.getString('Anchovy', 'unableToOpenSupportGroup'));
        });
    }

    checkUpdates(silent: boolean): void {
        session.defaultSession.clearCache().then(() => {
            let request: Electron.ClientRequest = net.request({
                url: 'https://maxprograms.com/anchovy.json',
                session: session.defaultSession
            });
            request.on('response', (response: IncomingMessage) => {
                let responseData: string = '';
                response.on('data', (chunk: Buffer) => {
                    responseData += chunk;
                });
                response.on('end', () => {
                    try {
                        let parsedData: any = JSON.parse(responseData);
                        if (app.getVersion() !== parsedData.version) {
                            this.latestVersion = parsedData.version;
                            switch (process.platform) {
                                case 'darwin':
                                    this.downloadLink = process.arch === 'arm64' ? parsedData.arm64 : parsedData.darwin;
                                    break;
                                case 'win32':
                                    this.downloadLink = parsedData.win32;
                                    break;
                                case 'linux':
                                    this.downloadLink = parsedData.linux;
                                    break;
                            }
                            this.updatesWindow = new BrowserWindow({
                                parent: this.mainWindow,
                                width: 500,
                                height: 250,
                                maximizable: false,
                                minimizable: false,
                                fullscreenable: false,
                                webPreferences: {
                                    nodeIntegration: true,
                                    contextIsolation: false
                                },
                                show: false,
                                icon: join(app.getAppPath(), 'images', 'anchovy.png')
                            });
                            this.updatesWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/updates.html'));
                            this.updatesWindow.once('ready-to-show', () => {
                                this.updatesWindow?.show();
                            });
                            this.updatesWindow.on('closed', () => {
                                this.mainWindow?.focus();
                            });
                            this.updatesWindow.setMenu(null);
                        } else if (!silent) {
                            dialog.showMessageBox(this.mainWindow, {
                                type: 'info',
                                message: Anchovy.i18n.getString('Anchovy', 'noUpdates')
                            });
                        }
                    } catch (error: unknown) {
                        if (!silent) {
                            dialog.showMessageBox(this.mainWindow, {
                                type: 'error',
                                title: Anchovy.i18n.getString('Anchovy', 'error'),
                                message: String(error)
                            });
                        }
                    }
                });
            });
            request.on('error', (error: Error) => {
                if (!silent) {
                    dialog.showMessageBox(this.mainWindow, {
                        type: 'error',
                        title: Anchovy.i18n.getString('Anchovy', 'error'),
                        message: error.message
                    });
                }
            });
            request.end();
        });
    }

    downloadLatest(): void {
        let downloadsFolder: string = app.getPath('downloads');
        let url: URL = new URL(this.downloadLink);
        let path: string = url.pathname;
        path = path.substring(path.lastIndexOf('/') + 1);
        let file: string = join(downloadsFolder, path);
        if (existsSync(file)) {
            unlinkSync(file);
        }
        let request: Electron.ClientRequest = net.request({
            url: this.downloadLink,
            session: session.defaultSession
        });
        this.mainWindow?.webContents.send('set-status', Anchovy.i18n.getString('Anchovy', 'downloading'));
        this.updatesWindow?.destroy();
        request.on('response', (response: IncomingMessage) => {
            let fileSize: number = Number.parseInt(response.headers['content-length'] as string);
            let received: number = 0;
            let downloaded: string = Anchovy.i18n.getString('Anchovy', 'downloaded');
            response.on('data', (chunk: Buffer) => {
                received += chunk.length;
                if (process.platform === 'win32' || process.platform === 'darwin') {
                    this.mainWindow?.setProgressBar(received / fileSize);
                }
                this.mainWindow?.webContents.send('set-status', Anchovy.i18n.format(downloaded, ['' + Math.trunc(received * 100 / fileSize)]));
                appendFileSync(file, chunk);
            });
            response.on('end', () => {
                this.mainWindow?.webContents.send('set-status', '');
                dialog.showMessageBox({
                    type: 'info',
                    message: Anchovy.i18n.getString('Anchovy', 'updateDownloaded')
                });
                if (process.platform === 'win32' || process.platform === 'darwin') {
                    this.mainWindow?.setProgressBar(0);
                    shell.openPath(file).then(() => {
                        app.quit();
                    }).catch((reason: string) => {
                        dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), reason);
                    });
                }
                if (process.platform === 'linux') {
                    shell.showItemInFolder(file);
                }
            });
            response.on('error', (error: Error) => {
                this.mainWindow?.webContents.send('set-status', '');
                dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), error.message);
                if (process.platform === 'win32' || process.platform === 'darwin') {
                    this.mainWindow?.setProgressBar(0);
                }
            });
        });
        request.end();
    }

    newFile(): void {
        if (this.model && this.model.isModified()) {
            let clicked: number = dialog.showMessageBoxSync(this.mainWindow, {
                type: 'question',
                title: Anchovy.i18n.getString('Anchovy', 'saveChanges'),
                message: Anchovy.i18n.getString('Anchovy', 'unsavedChanges'),
                buttons: [
                    Anchovy.i18n.getString('Anchovy', 'dontSave'),
                    Anchovy.i18n.getString('Anchovy', 'cancel'),
                    Anchovy.i18n.getString('Anchovy', 'save')
                ],
                defaultId: 2
            });
            if (clicked === 0) {
                // Don't save, just continue
            }
            if (clicked === 1) {
                return;
            }
            if (clicked === 2) {
                this.saveFile();
            }
        }
        this.newGlossaryWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 420,
            height: 120,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.newGlossaryWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/newGlossary.html'));
        this.newGlossaryWindow.once('ready-to-show', () => {
            this.newGlossaryWindow?.show();
        });
        this.newGlossaryWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.newGlossaryWindow.setMenu(null);
    }

    beforeQuit(event: Electron.Event): void {
        if (this.model && !this.closeFile()) {
            event.preventDefault();
        }
    }

    showOpenFileDialog(): void {
        dialog.showOpenDialog({
            title: 'Open Glossary',
            filters: [
                { name: Anchovy.i18n.getString('Anchovy', 'glossaryFile'), extensions: ['gls'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ],
            properties: ['openFile']
        }).then(result => {
            if (!result.canceled && result.filePaths.length > 0) {
                this.openFile(result.filePaths[0])
            }
        }).catch(err => {
            console.error(err);
        });
    }

    openFile(filePath: string): void {
        try {
            this.mainWindow.webContents.send('set-status', Anchovy.i18n.getString('Anchovy', 'loadingFile'));
            if (this.model) {
                this.model.close();
                this.model = null;
            }
            let dbPath: string = join(app.getPath('userData'), 'glossary.db');
            let messagesPath: string = join(app.getAppPath(), 'i18n', 'anchovy_' + Anchovy.appLang + '.json');
            this.model = new GlossaryModel(dbPath, filePath, messagesPath, Anchovy.appLang);
            this.srcLang = this.model.getSourceLanguage();
            this.currentFile = filePath;
            this.columns = this.model.getColumns();
            this.sortColumnType = null;
            this.sortColumnLang = undefined;
            this.sortAscending = true;
            this.mainWindow?.setTitle('Anchovy - ' + this.currentFile);
            this.mainWindow?.webContents.send('set-file-info', {
                totalRows: this.model.getEntryCount(),
                columns: this.columns
            });
            this.mainWindow?.webContents.send('set-sort', { colIndex: this.resolveSortColIndex(), ascending: this.sortAscending });
            this.mainWindow.webContents.send('set-status', '');
            this.mainWindow?.setDocumentEdited(false);
            this.saveRecent(filePath);
            this.createMenu();
        } catch (error) {
            this.mainWindow.webContents.send('set-status', '');
            dialog.showMessageBox(this.mainWindow, {
                type: 'error',
                title: Anchovy.i18n.getString('Anchovy', 'error'),
                message: String(error)
            });
        }
    }


    getRecentFiles(): string[] {
        let recentFile: string = join(app.getPath('appData'), app.name, 'recent.json');
        if (!existsSync(recentFile)) {
            return [];
        }
        try {
            let json: { files: string[] } = JSON.parse(readFileSync(recentFile).toString());
            return (json.files ?? []).filter((file: string) => existsSync(file));
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    saveRecent(filePath: string): void {
        let dataFolder: string = join(app.getPath('appData'), app.name);
        if (!existsSync(dataFolder)) {
            mkdirSync(dataFolder, { recursive: true });
        }
        let recentFile: string = join(dataFolder, 'recent.json');
        let files: string[] = [];
        if (existsSync(recentFile)) {
            try {
                files = JSON.parse(readFileSync(recentFile).toString()).files ?? [];
            } catch (error) {
                console.error(error);
            }
        }
        files = files.filter((file: string) => file !== filePath);
        files.unshift(filePath);
        if (files.length > 5) {
            files = files.slice(0, 5);
        }
        writeFileSync(recentFile, JSON.stringify({ files: files }, null, 2));
        app.addRecentDocument(filePath);
    }

    getRows(start: number, count: number, scroll: boolean): void {
        if (!this.model) {
            return;
        }
        let rowValues: { id: number, values: string[] }[] = this.model.getRowValues(count, start, this.sortColumnType, this.sortColumnLang, this.sortAscending);
        this.mainWindow?.webContents.send('set-rows', {
            rows: this.buildRows(rowValues, start),
            totalRows: this.model.getEntryCount(),
            start: start,
            scroll: scroll
        });
    }

    resolveSortColIndex(): number {
        if (!this.sortColumnType) {
            return -1;
        }
        for (let i = 0; i < this.columns.length; i++) {
            if (this.columns[i].type === this.sortColumnType && this.columns[i].lang === this.sortColumnLang) {
                return i;
            }
        }
        return -1;
    }

    sortColumn(colIndex: number): void {
        if (!this.model) {
            return;
        }
        if (colIndex < 0) {
            this.sortColumnType = null;
            this.sortColumnLang = undefined;
            this.sortAscending = true;
        } else if (colIndex < this.columns.length) {
            let column: Column = this.columns[colIndex];
            if (this.sortColumnType === column.type && this.sortColumnLang === column.lang) {
                this.sortAscending = !this.sortAscending;
            } else {
                this.sortColumnType = column.type;
                this.sortColumnLang = column.lang;
                this.sortAscending = true;
            }
        } else {
            return;
        }
        this.mainWindow?.webContents.send('set-sort', { colIndex: this.resolveSortColIndex(), ascending: this.sortAscending });
        let count: number = Math.min(this.model.getEntryCount(), this.ROWSLOAD);
        this.getRows(0, count, true);
    }

    buildRows(rowValues: { id: number, values: string[] }[], startOffset: number): string[] {
        let rows: string[] = [];
        for (let rowValue of rowValues) {
            let tr: string = '<tr id="' + rowValue.id + '" data-row="' + (startOffset + rows.length) + '">';
            tr = tr + '<td class="fixed">' + (startOffset + rows.length + 1) + '</td>';
            for (let j = 0; j < rowValue.values.length; j++) {
                tr = tr + '<td class="cell" data-entry="' + rowValue.id + '" data-col="' + j + '"' + (this.isBidiCol(j) ? ' dir="rtl" text-align="right"' : '') + this.getCellLanguage(j) + '>' + this.escapeHtml(rowValue.values[j]) + '</td>';
            }
            tr = tr + '</tr>';
            rows.push(tr);
        }
        return rows;
    }

    isBidiCol(col: number): boolean {
        let column: Column = this.columns[col];
        if (column.lang) {
            return LanguageUtils.isBiDi(column.lang);
        }
        return false;
    }

    getCellLanguage(col: number): string {
        let column: Column = this.columns[col];
        if (column.lang) {
            return ' lang="' + column.lang + '"';
        }
        return '';
    }

    private escapeHtml(text: string): string {
        return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    }

    saveFile(): void {
        if (this.model && this.currentFile === '') {
            this.saveFileAs();
            return;
        }
        if (this.model && this.currentFile) {
            if (!this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('set-status', Anchovy.i18n.getString('Anchovy', 'savingFile'));
            }
            this.model.exportToGlossML(this.currentFile);
            if (!this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('set-status', '');
                this.mainWindow.setDocumentEdited(false);
            }
        }
    }

    saveFileAs(): void {
        if (!this.model) {
            return;
        }
        dialog.showSaveDialog(this.mainWindow, {
            title: Anchovy.i18n.getString('Anchovy', 'saveFileAs'),
            properties: ['createDirectory', 'showOverwriteConfirmation'],
            filters: [
                { name: Anchovy.i18n.getString('Anchovy', 'glossaryFile'), extensions: ['gls'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ],
            defaultPath: this.currentFile
        }).then((value) => {
            if (!value.canceled) {
                this.currentFile = value.filePath;
                this.saveFile();
                this.mainWindow?.setTitle('Anchovy - ' + this.currentFile);
                this.saveRecent(this.currentFile);
                this.createMenu();
            }
        }).catch((error) => {
            console.log(error);
        });
    }

    // Returns false if the user cancelled the save-changes prompt, leaving the model open.
    closeFile(): boolean {
        if (!this.model) {
            return true;
        }
        if (this.model.isModified()) {
            let clicked: number = dialog.showMessageBoxSync(this.mainWindow, {
                type: 'question',
                title: Anchovy.i18n.getString('Anchovy', 'saveChanges'),
                message: Anchovy.i18n.getString('Anchovy', 'unsavedChanges'),
                buttons: [
                    Anchovy.i18n.getString('Anchovy', 'dontSave'),
                    Anchovy.i18n.getString('Anchovy', 'cancel'),
                    Anchovy.i18n.getString('Anchovy', 'save')
                ],
                defaultId: 2
            });
            if (clicked === 1) {
                return false;
            }
            if (clicked === 2) {
                this.saveFile();
            }
        }
        this.model.close();
        this.model = null;
        this.currentFile = null;
        this.columns = [];
        this.mainWindow?.setTitle('Anchovy');
        this.mainWindow?.webContents.send('set-file-info', {
            totalRows: 0,
            columns: []
        });
        this.mainWindow?.setDocumentEdited(false);
        this.closeModelDialogs();
        return true;
    }

    private closeModelDialogs(): void {
        if (this.addColumnWindow && !this.addColumnWindow.isDestroyed()) {
            this.addColumnWindow.close();
        }
        if (this.searchReplaceWindow && !this.searchReplaceWindow.isDestroyed()) {
            this.searchReplaceWindow.close();
        }
        if (this.glossaryInfoWindow && !this.glossaryInfoWindow.isDestroyed()) {
            this.glossaryInfoWindow.close();
        }
    }

    private markModified(): void {
        this.mainWindow?.setDocumentEdited(true);
    }

    private notifyExportComplete(filePath: string): void {
        dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: Anchovy.i18n.getString('Anchovy', 'exportComplete'),
            message: Anchovy.i18n.getString('Anchovy', 'glossaryExported'),
            buttons: [Anchovy.i18n.getString('Anchovy', 'yes'), Anchovy.i18n.getString('Anchovy', 'no')],
            defaultId: 0,
            cancelId: 1
        }).then((result) => {
            if (result.response === 0) {
                shell.openPath(filePath).catch((error) => {
                    console.log(error);
                });
            }
        }).catch((error) => {
            console.log(error);
        });
    }

    exportHTML(): void {
        if (!this.model) {
            return;
        }
        dialog.showSaveDialog(this.mainWindow, {
            title: Anchovy.i18n.getString('Anchovy', 'exportHTML'),
            properties: ['createDirectory', 'showOverwriteConfirmation'],
            filters: [
                { name: Anchovy.i18n.getString('Anchovy', 'htmlFile'), extensions: ['html'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ],
            defaultPath: this.currentFile ? this.currentFile.replace(/\.[^/.]+$/, '.html') : undefined
        }).then((value) => {
            if (!value.canceled && value.filePath) {
                try {
                    this.writeHtmlExport(value.filePath);
                    this.notifyExportComplete(value.filePath);
                } catch (error: unknown) {
                    if (error instanceof Error) {
                        dialog.showMessageBox(this.mainWindow, { type: 'error', title: Anchovy.i18n.getString('Anchovy', 'error'), message: error.message });
                    }
                }
            }
        }).catch((error) => {
            console.log(error);
        });
    }

    private writeHtmlExport(filePath: string): void {
        if (!this.model) {
            return;
        }
        let headerCells: string = '<th>#</th>' + this.columns.map((column: Column, index: number) =>
            '<th' + (this.isBidiCol(index) ? ' dir="rtl"' : '') + this.getCellLanguage(index) + '>' + this.escapeHtml(column.description) + '</th>'
        ).join('');
        let head: string = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n'
            + '<title>' + this.escapeHtml(this.currentFile ?? 'Glossary') + '</title>\n'
            + '<style>\n'
            + 'body { font-family: sans-serif; }\n'
            + 'table { border-collapse: collapse; width: 100%; }\n'
            + 'th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; vertical-align: top; }\n'
            + 'th { background-color: #f0f0f0; }\n'
            + '</style>\n</head>\n<body>\n<table>\n<thead>\n<tr>' + headerCells + '</tr>\n</thead>\n<tbody>\n';
        writeFileSync(filePath, head, 'utf8');

        let batchSize: number = 1000;
        let entryCount: number = this.model.getEntryCount();
        let offset: number = 0;
        while (offset < entryCount) {
            let rowValues: { id: number, values: string[] }[] = this.model.getRowValues(batchSize, offset, this.sortColumnType, this.sortColumnLang, this.sortAscending);
            let rows: string[] = this.buildRows(rowValues, offset);
            appendFileSync(filePath, rows.join('\n') + '\n', 'utf8');
            offset = offset + rowValues.length;
        }

        appendFileSync(filePath, '</tbody>\n</table>\n</body>\n</html>\n', 'utf8');
    }

    exportTMX(): void {
        if (!this.model) {
            return;
        }
        dialog.showSaveDialog(this.mainWindow, {
            title: Anchovy.i18n.getString('Anchovy', 'exportTMX'),
            properties: ['createDirectory', 'showOverwriteConfirmation'],
            filters: [
                { name: 'TMX', extensions: ['tmx'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ],
            defaultPath: this.currentFile ? this.currentFile.replace(/\.[^/.]+$/, '.tmx') : undefined
        }).then((value) => {
            if (!value.canceled && value.filePath) {
                try {
                    this.model?.exportTMX(value.filePath, app.getVersion());
                    this.notifyExportComplete(value.filePath);
                } catch (error: unknown) {
                    if (error instanceof Error) {
                        dialog.showMessageBox(this.mainWindow, { type: 'error', title: Anchovy.i18n.getString('Anchovy', 'error'), message: error.message });
                    }
                }
            }
        }).catch((error) => {
            console.log(error);
        });
    }

    exportTBX(): void {
        if (!this.model) {
            return;
        }
        dialog.showSaveDialog(this.mainWindow, {
            title: Anchovy.i18n.getString('Anchovy', 'exportTBX'),
            properties: ['createDirectory', 'showOverwriteConfirmation'],
            filters: [
                { name: 'TBX', extensions: ['tbx'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ],
            defaultPath: this.currentFile ? this.currentFile.replace(/\.[^/.]+$/, '.tbx') : undefined
        }).then((value) => {
            if (!value.canceled && value.filePath) {
                try {
                    this.model?.exportTBX(value.filePath, app.getVersion());
                    this.notifyExportComplete(value.filePath);
                } catch (error: unknown) {
                    if (error instanceof Error) {
                        dialog.showMessageBox(this.mainWindow, { type: 'error', title: Anchovy.i18n.getString('Anchovy', 'error'), message: error.message });
                    }
                }
            }
        }).catch((error) => {
            console.log(error);
        });
    }

    exportCSV(): void {
        if (!this.model) {
            return;
        }
        dialog.showSaveDialog(this.mainWindow, {
            title: Anchovy.i18n.getString('Anchovy', 'exportCSV'),
            properties: ['createDirectory', 'showOverwriteConfirmation'],
            filters: [
                { name: Anchovy.i18n.getString('Anchovy', 'csvFile'), extensions: ['csv'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ],
            defaultPath: this.currentFile ? this.currentFile.replace(/\.[^/.]+$/, '.csv') : undefined
        }).then((value) => {
            if (!value.canceled && value.filePath) {
                this.model?.exportCSV(value.filePath);
                this.notifyExportComplete(value.filePath);
            }
        }).catch((error) => {
            console.log(error);
        });
    }

    exportExcel(): void {
        if (!this.model) {
            return;
        }
        dialog.showSaveDialog(this.mainWindow, {
            title: Anchovy.i18n.getString('Anchovy', 'exportExcel'),
            properties: ['createDirectory', 'showOverwriteConfirmation'],
            filters: [
                { name: Anchovy.i18n.getString('Anchovy', 'excelFile'), extensions: ['xlsx'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ],
            defaultPath: this.currentFile ? this.currentFile.replace(/\.[^/.]+$/, '.xlsx') : undefined
        }).then((value) => {
            if (!value.canceled && value.filePath) {
                this.model?.exportExcel(value.filePath);
                this.notifyExportComplete(value.filePath);
            }
        }).catch((error) => {
            console.log(error);
        });
    }

    private static openAppFile(filePath: string): void {
        if (process.platform === 'linux') {
            let segments: string[] = filePath.split('/').filter((segment: string) => segment.length > 0);
            let isHidden: boolean = segments.some((segment: string) => segment.startsWith('.'));
            if (isHidden || filePath.startsWith('/opt')) {
                let tempFolder: string = join(app.getPath('home'), 'tmp', 'anchovy');
                if (!existsSync(tempFolder)) {
                    mkdirSync(tempFolder, { recursive: true });
                }
                let tempFile: string = join(tempFolder, basename(filePath));
                try {
                    copyFileSync(filePath, tempFile);
                    filePath = tempFile;
                } catch (error: unknown) {
                    console.error('Error copying file:', error);
                    dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), (error as Error).message);
                    return;
                }
            }
        }
        let fileUrl: URL = new URL('file://' + filePath);
        shell.openExternal(fileUrl.href).catch((error: Error) => {
            dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), error.message);
        });
    }

    static showHelp(): void {
        let filePath = join(app.getAppPath(), 'anchovy_' + Anchovy.appLang + '.pdf');
        Anchovy.openAppFile(filePath);
    }

    static showGlosML(): void {
        let filePath = join(app.getAppPath(), 'glossml.pdf');
        Anchovy.openAppFile(filePath);
    }

    showAbout(): void {
        this.aboutWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 400,
            height: 400,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.aboutWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/about.html'));
        this.aboutWindow.once('ready-to-show', () => {
            this.aboutWindow?.show();
        });
        this.aboutWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.aboutWindow.setMenu(null);
    }

    showSystemInfo(): void {
        this.systemInfoWindow = new BrowserWindow({
            parent: this.aboutWindow,
            width: 400,
            height: 420,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.systemInfoWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/systemInfo.html'));
        this.systemInfoWindow.once('ready-to-show', () => {
            this.systemInfoWindow?.show();
        });
        this.systemInfoWindow.on('closed', () => {
            this.aboutWindow?.focus();
        });
        this.systemInfoWindow.setMenu(null);
    }

    getSystemInfo(): { anchovy: string, java: string, xmljava: string, openxliff: string, bcp47j: string, electron: string, typesbcp47: string, typesexcel: string, typesterms: string, typesxliff: string, typesxml: string } {
        let version: { java: string, javaVendor: string, xmlVersion: string, xmlBuild: string, version: string, build: string, bcp47jVersion: string, bcp47jBuild: string } = JSON.parse(this.runJava('openxliff/com.maxprograms.converters.Constants', []).trim());
        return {
            anchovy: app.getVersion(),
            java: version.java + ' - ' + version.javaVendor,
            xmljava: version.xmlVersion + ' - ' + version.xmlBuild,
            openxliff: version.version + ' - ' + version.build,
            bcp47j: version.bcp47jVersion + ' - ' + version.bcp47jBuild,
            electron: process.versions.electron,
            typesbcp47: this.getModuleVersion('typesbcp47'),
            typesexcel: this.getModuleVersion('typesexcel'),
            typesterms: this.getModuleVersion('typesterms'),
            typesxliff: this.getModuleVersion('typesxliff'),
            typesxml: this.getModuleVersion('typesxml')
        };
    }

    getModuleVersion(moduleName: string): string {
        let packageFile: string = join(app.getAppPath(), 'node_modules', moduleName, 'package.json');
        let json: { version: string } = JSON.parse(readFileSync(packageFile, 'utf8'));
        return json.version;
    }

    showSettings(): void {
        this.preferencesDialogWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 500,
            height: 250,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.preferencesDialogWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/preferencesDialog.html'));
        this.preferencesDialogWindow.once('ready-to-show', () => {
            this.preferencesDialogWindow?.show();
        });
        this.preferencesDialogWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.preferencesDialogWindow.setMenu(null);
    }

    addRow(args?: { afterEntryId: string | null, colIndex: number }): void {
        if (!this.model) {
            return;
        }
        let afterEntryId: number | undefined = args?.afterEntryId ? Number.parseInt(args.afterEntryId) : undefined;
        let colIndex: number = args?.colIndex !== undefined && args.colIndex >= 0 ? args.colIndex : 0;
        let entryId: number = this.model.addEntry(afterEntryId);
        this.markModified();
        let totalRows: number = this.model.getEntryCount();
        let row: number = this.model.getEntryRow(entryId);
        this.mainWindow?.webContents.send('row-added', {
            totalRows: totalRows,
            entryId: entryId,
            colIndex: colIndex,
            row: row
        });
    }

    removeRow(entryId: number, start: number): void {
        if (!this.model) {
            return;
        }
        let clicked: number = dialog.showMessageBoxSync(this.mainWindow, {
            type: 'question',
            title: Anchovy.i18n.getString('menu', 'deleteRow'),
            message: Anchovy.i18n.getString('Anchovy', 'confirmRemoveRow'),
            buttons: [
                Anchovy.i18n.getString('Anchovy', 'yes'),
                Anchovy.i18n.getString('Anchovy', 'no')
            ],
            defaultId: 1,
            cancelId: 1
        });
        if (clicked !== 0) {
            return;
        }
        this.model.removeEntry(entryId);
        this.markModified();
        let entryCount: number = this.model.getEntryCount();
        let count: number = Math.min(entryCount, this.ROWSLOAD);
        let newStart: number = Math.max(0, Math.min(start, entryCount - count));
        this.getRows(newStart, count, false);
    }

    showAddColumnDialog(): void {
        if (!this.model) {
            return;
        }
        this.addColumnWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 500,
            height: 250,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.addColumnWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/addColumn.html'));
        this.addColumnWindow.once('ready-to-show', () => {
            this.addColumnWindow?.show();
            this.addColumnWindow.webContents.send('set-columns', this.model?.getColumns() || []);
        });
        this.addColumnWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.addColumnWindow.setMenu(null);
    }

    addColumn(args: { comment: boolean, term: boolean, definition: boolean, language: string }): void {
        if (!this.model) {
            return;
        }
        let type: ColumnTypes = ColumnTypes.TERM;
        if (args.comment) {
            type = ColumnTypes.COMMENT;
        } else if (args.definition) {
            type = ColumnTypes.DEFINITION;
        }
        let column: Column = new Column(type, args.language, '');
        this.model.addColumn(column);
        this.markModified();
        this.columns = this.model.getColumns();
        this.mainWindow?.webContents.send('set-columns', this.columns);
        this.mainWindow?.webContents.send('set-sort', { colIndex: this.resolveSortColIndex(), ascending: this.sortAscending });
        this.addColumnWindow?.close();
    }

    removeColumn(colIndex: number): void {
        if (!this.model || colIndex < 0 || colIndex >= this.columns.length) {
            return;
        }
        let column: Column = this.columns[colIndex];
        let clicked: number = dialog.showMessageBoxSync(this.mainWindow, {
            type: 'question',
            title: Anchovy.i18n.getString('menu', 'deleteColumn'),
            message: Anchovy.i18n.getString('Anchovy', 'confirmRemoveColumn'),
            buttons: [
                Anchovy.i18n.getString('Anchovy', 'yes'),
                Anchovy.i18n.getString('Anchovy', 'no')
            ],
            defaultId: 1,
            cancelId: 1
        });
        if (clicked !== 0) {
            return;
        }
        this.model.removeColumn(column);
        this.markModified();
        this.columns = this.model.getColumns();
        if (this.sortColumnType === column.type && this.sortColumnLang === column.lang) {
            this.sortColumnType = null;
            this.sortColumnLang = undefined;
            this.sortAscending = true;
        }
        this.mainWindow?.webContents.send('set-columns', this.columns);
        this.mainWindow?.webContents.send('set-sort', { colIndex: this.resolveSortColIndex(), ascending: this.sortAscending });
    }

    replaceTextDialog(): void {
        if (!this.model) {
            return;
        }
        this.searchReplaceWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 550,
            height: 400,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.searchReplaceWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/searchReplace.html'));
        this.searchReplaceWindow.once('ready-to-show', () => {
            this.searchReplaceWindow?.show();
        });
        this.searchReplaceWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.searchReplaceWindow.setMenu(null);
    }

    findText(args: { searchText: string, caseSensitive: boolean, useRegex: boolean }): void {
        this.performSearch(args.searchText, 0, 0, args.caseSensitive, args.useRegex);
    }

    findNextText(args: { searchText: string, caseSensitive: boolean, useRegex: boolean }): void {
        if (!this.model) {
            return;
        }
        this.mainWindow?.webContents.send('get-search-start', args);
    }

    searchStartReceived(searchText: string, caseSensitive: boolean, useRegex: boolean, row: number, column: number): void {
        let nextColumn: number = column + 1;
        let nextRow: number = row;
        if (nextColumn >= this.columns.length) {
            nextColumn = 0;
            nextRow = row + 1;
        }
        this.performSearch(searchText, nextRow, nextColumn, caseSensitive, useRegex);
    }

    private performSearch(text: string, row: number, column: number, caseSensitive: boolean, useRegex: boolean): void {
        if (!this.model) {
            return;
        }
        let match: { entryId: number, row: number, column: number } | null = this.model.searchText(text, row, column, caseSensitive, useRegex);
        this.searchReplaceWindow?.webContents.send('match-found', match !== null);
        if (match) {
            this.mainWindow?.webContents.send('select-match', { entryId: match.entryId, row: match.row, column: match.column, searchText: text, caseSensitive: caseSensitive, useRegex: useRegex });
        } else {
            dialog.showMessageBox(this.searchReplaceWindow, {
                type: 'info',
                message: Anchovy.i18n.getString('searchReplace', 'textNotFound')
            });
        }
    }

    replaceCurrent(replaceText: string): void {
        this.mainWindow?.webContents.send('replace-selected-text', replaceText);
    }

    replaceAll(args: { searchText: string, replaceText: string, caseSensitive: boolean, useRegex: boolean }): void {
        let clicked: number = dialog.showMessageBoxSync(this.searchReplaceWindow, {
            type: 'question',
            title: Anchovy.i18n.getString('menu', 'replaceText'),
            message: Anchovy.i18n.getString('searchReplace', 'confirmReplaceAll'),
            buttons: [
                Anchovy.i18n.getString('Anchovy', 'yes'),
                Anchovy.i18n.getString('Anchovy', 'no')
            ],
            defaultId: 1,
            cancelId: 1
        });
        if (clicked !== 0) {
            return;
        }
        let count: number = this.model.replaceAll(args.searchText, args.replaceText, args.caseSensitive, args.useRegex);
        if (count > 0) {
            this.markModified();
            this.mainWindow?.webContents.send('set-file-info', {
                totalRows: this.model.getEntryCount(),
                columns: this.columns
            });
        }
        dialog.showMessageBox(this.searchReplaceWindow, {
            type: 'info',
            message: Anchovy.i18n.format(Anchovy.i18n.getString('searchReplace', 'replacementsMade'), ['' + count])
        });
    }

    changeLanguages(): void {
        this.changeLanguagesWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 400,
            height: 140,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.changeLanguagesWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/changeLanguages.html'));
        this.changeLanguagesWindow.once('ready-to-show', () => {
            this.changeLanguagesWindow?.show();
        });
        this.changeLanguagesWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.changeLanguagesWindow.setMenu(null);
    }

    saveLanguages(args: { oldLanguage: string, newLanguage: string }): void {
        this.model.renameLanguage(args.oldLanguage, args.newLanguage);
        this.markModified();
        this.srcLang = this.model.getSourceLanguage();
        this.columns = this.model.getColumns();
        this.mainWindow?.webContents.send('set-columns', this.columns);
        this.mainWindow?.webContents.send('set-sort', { colIndex: this.resolveSortColIndex(), ascending: this.sortAscending });
        this.changeLanguagesWindow?.close();
    }

    termExtraction(): void {
        this.extractTermsWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 650,
            height: 330,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.extractTermsWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/extractTerms.html'));
        this.extractTermsWindow.once('ready-to-show', () => {
            this.extractTermsWindow?.show();
        });
        this.extractTermsWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.extractTermsWindow.setMenu(null);
    }

    setHeight(args: { window: string, height: number, width: number }): void {
        if (args.window === 'extractTerms' && this.extractTermsWindow) {
            this.extractTermsWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'bilingualExtractTerms' && this.bilingualExtractTermsWindow) {
            this.bilingualExtractTermsWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'bilingualCandidatesViewer' && this.bilingualCandidatesViewerWindow) {
            this.bilingualCandidatesViewerWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'about' && this.aboutWindow) {
            this.aboutWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'systemInfo' && this.systemInfoWindow) {
            this.systemInfoWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'changeLanguages' && this.changeLanguagesWindow) {
            this.changeLanguagesWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'preferencesDialog' && this.preferencesDialogWindow) {
            this.preferencesDialogWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'licenses' && this.licensesWindow) {
            this.licensesWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'addColumn' && this.addColumnWindow) {
            this.addColumnWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'importExcel' && this.importExcelWindow) {
            this.importExcelWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'importCsv' && this.importCsvWindow) {
            this.importCsvWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'tmxToGlossML' && this.tmxToGlossMLWindow) {
            this.tmxToGlossMLWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'tbxToGlossML' && this.tbxToGlossMLWindow) {
            this.tbxToGlossMLWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'updates' && this.updatesWindow) {
            this.updatesWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'searchReplace' && this.searchReplaceWindow) {
            this.searchReplaceWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'candidatesViewer' && this.candidatesViewerWindow) {
            this.candidatesViewerWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'glossaryInfo' && this.glossaryInfoWindow) {
            this.glossaryInfoWindow.setContentSize(args.width, args.height, true);
        }
        if (args.window === 'newGlossary' && this.newGlossaryWindow) {
            this.newGlossaryWindow.setContentSize(args.width, args.height, true);
        }
    }

    bilingualTermExtraction(): void {
        this.bilingualExtractTermsWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 650,
            height: 200,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.bilingualExtractTermsWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/bilingualExtractTerms.html'));
        this.bilingualExtractTermsWindow.once('ready-to-show', () => {
            this.bilingualExtractTermsWindow?.show();
        });
        this.bilingualExtractTermsWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.bilingualExtractTermsWindow.setMenu(null);
    }

    browseBilingualXliff(): void {
        dialog.showOpenDialog(this.bilingualExtractTermsWindow, {
            title: Anchovy.i18n.getString('Anchovy', 'xliffFile'),
            properties: ['openFile'],
            filters: [
                { name: Anchovy.i18n.getString('Anchovy', 'xliffFile'), extensions: ['xlf', 'xliff'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ]
        }).then((value) => {
            if (!value.canceled && value.filePaths.length > 0) {
                this.bilingualExtractTermsWindow?.webContents.send('set-bilingual-xliff', value.filePaths[0]);
            }
        }).catch((error) => {
            console.error(error);
        });
    }

    extractBilingualCandidates(xliffFile: string, frequency: number, termLength: number, glossmlFile: string): void {
        let languages: { srcLang: string, trgLang: string | undefined } = this.getXliffLanguages(xliffFile);
        if (!languages.srcLang || !languages.trgLang) {
            dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), Anchovy.i18n.getString('bilingualExtractTerms', 'missingLanguages'));
            return;
        }
        this.mainWindow.webContents.send('set-status', Anchovy.i18n.getString('Anchovy', 'extractingTerms'));
        let dataFolder: string = app.getPath('appData');
        let tempFolder: string = join(dataFolder, app.name, 'temp');
        if (!existsSync(tempFolder)) {
            mkdirSync(tempFolder, { recursive: true });
        }
        let candidatesFile: string = join(tempFolder, 'candidate_terms.csv');
        try {
            const extractor: BilingualExtraction = new BilingualExtraction();
            extractor.extract(xliffFile, candidatesFile, frequency, 10.0, termLength, 1, 0, 0.7, Anchovy.appLang);

            this.openBilingualCandidatesViewer(languages.srcLang, languages.trgLang, glossmlFile);
            this.mainWindow.webContents.send('set-status', '');
            this.bilingualExtractTermsWindow?.close();
        } catch (err: unknown) {
            this.mainWindow.webContents.send('set-status', '');
            if (err instanceof Error) {
                dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), err.message);
                return;
            }
            console.error(err);
        }
    }

    private getXliffLanguages(xliffFile: string): { srcLang: string, trgLang: string | undefined } {
        let parser: XliffParser = new XliffParser();
        parser.parseFile(xliffFile);
        let doc: XliffDocument | undefined = parser.getXliffDocument();
        return {
            srcLang: doc ? doc.srcLang : '',
            trgLang: doc?.trgLang
        };
    }

    openBilingualCandidatesViewer(srcLang: string, trgLang: string, glossmlFile: string): void {
        this.bilingualCandidatesViewerWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 900,
            height: 600,
            minHeight: 400,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.bilingualCandidatesViewerWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/bilingualCandidatesViewer.html'));
        this.bilingualCandidatesViewerWindow.once('ready-to-show', () => {
            this.bilingualCandidatesViewerWindow?.show();
            let dataFolder: string = app.getPath('appData');
            let tempFolder: string = join(dataFolder, app.name, 'temp');
            let candidatesFile: string = join(tempFolder, 'candidate_terms.csv');
            let data: string = readFileSync(candidatesFile, 'utf-16le');
            this.bilingualCandidatesViewerWindow?.webContents.send('set-bilingual-candidates', { data, srcLang, trgLang, glossmlFile });
        });
        this.bilingualCandidatesViewerWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.bilingualCandidatesViewerWindow.setMenu(null);
    }

    createBilingualGlossary(pairs: { source: string, target: string }[], srcLang: string, trgLang: string, glossmlFile: string, openResult: boolean): void {
        this.makeBilingualGlossary(pairs, srcLang, trgLang, glossmlFile);
        this.bilingualCandidatesViewerWindow?.close();
        if (openResult) {
            if (this.currentFile && !this.closeFile()) {
                return;
            }
            this.openFile(glossmlFile);
        } else {
            dialog.showMessageBox(this.mainWindow, { type: 'info', message: Anchovy.i18n.getString('Anchovy', 'glossaryImported') });
        }
    }

    makeBilingualGlossary(pairs: { source: string, target: string }[], srcLang: string, trgLang: string, filePath: string): void {
        let glossaryDoc: XMLDocument = new XMLDocument();
        glossaryDoc.setXmlDeclaration(new XMLDeclaration('1.0', 'UTF-8', 'no'));
        glossaryDoc.addTextNode(new TextNode('\n'));
        let glossaryElement: XMLElement = new XMLElement('glossary');
        glossaryElement.setAttribute(new XMLAttribute('srclang', srcLang));
        glossaryElement.setAttribute(new XMLAttribute('version', '1.0'));
        glossaryElement.setAttribute(new XMLAttribute('xmlns', 'http://maxprograms.com/gml'));
        glossaryElement.setAttribute(new XMLAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance'));
        glossaryDoc.setRoot(glossaryElement);
        for (let pair of pairs) {
            let glossEntry: XMLElement = new XMLElement('glossentry');

            let sourceLangEntry: XMLElement = new XMLElement('langentry');
            sourceLangEntry.setAttribute(new XMLAttribute('xml:lang', srcLang));
            let sourceTermElement: XMLElement = new XMLElement('term');
            sourceTermElement.addString(pair.source);
            sourceLangEntry.addElement(sourceTermElement);
            glossEntry.addElement(sourceLangEntry);

            let targetLangEntry: XMLElement = new XMLElement('langentry');
            targetLangEntry.setAttribute(new XMLAttribute('xml:lang', trgLang));
            let targetTermElement: XMLElement = new XMLElement('term');
            targetTermElement.addString(pair.target);
            targetLangEntry.addElement(targetTermElement);
            glossEntry.addElement(targetLangEntry);

            glossaryElement.addElement(glossEntry);
        }
        const indenter: Indenter = new Indenter(2);
        indenter.indent(glossaryElement);
        XMLWriter.writeDocument(glossaryDoc, filePath);
    }

    openCandidatesViewer(srcLang: string, glossmlFile: string): void {
        this.candidatesViewerWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 900,
            height: 600,
            minHeight: 400,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.candidatesViewerWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/candidatesViewer.html'));
        this.candidatesViewerWindow.once('ready-to-show', () => {
            this.candidatesViewerWindow?.show();
            let dataFolder: string = app.getPath('appData');
            let tempFolder: string = join(dataFolder, app.name, 'temp');
            let candidatesFile: string = join(tempFolder, 'candidate_terms.csv');
            let data: string = readFileSync(candidatesFile, 'utf-16le');
            this.candidatesViewerWindow?.webContents.send('set-candidates', { data, srcLang, glossmlFile });
        });
        this.candidatesViewerWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.candidatesViewerWindow.setMenu(null);
    }

    TMXtoGlossML(): void {
        this.tmxToGlossMLWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 600,
            height: 200,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.tmxToGlossMLWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/tmxToGlossML.html'));
        this.tmxToGlossMLWindow.once('ready-to-show', () => {
            this.tmxToGlossMLWindow?.show();
        });
        this.tmxToGlossMLWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.tmxToGlossMLWindow.setMenu(null);
    }

    browseTmxSource(): void {
        dialog.showOpenDialog(this.tmxToGlossMLWindow, {
            title: Anchovy.i18n.getString('Anchovy', 'tmxFile'),
            properties: ['openFile'],
            filters: [
                { name: Anchovy.i18n.getString('Anchovy', 'tmxFile'), extensions: ['tmx'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ]
        }).then((value) => {
            if (!value.canceled && value.filePaths.length > 0) {
                this.tmxToGlossMLWindow?.webContents.send('set-tmx-source', value.filePaths[0]);
            }
        }).catch((error) => {
            console.log(error);
        });
    }

    browseGlossmlTarget(targetWindow: BrowserWindow | null, defaultPath: string): void {
        dialog.showSaveDialog(targetWindow, {
            title: Anchovy.i18n.getString('Anchovy', 'saveGlossML'),
            properties: ['createDirectory', 'showOverwriteConfirmation'],
            filters: [
                { name: Anchovy.i18n.getString('Anchovy', 'glossaryFile'), extensions: ['gls'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ],
            defaultPath: defaultPath
        }).then((value) => {
            if (!value.canceled && value.filePath) {
                targetWindow?.webContents.send('set-glossml-target', value.filePath);
            }
        }).catch((error) => {
            console.log(error);
        });
    }

    convertTmxToGlossML(args: { tmxFile: string, glossmlFile: string, openResult: boolean }): void {
        this.tmxToGlossMLWindow?.close();
        try {
            new TMX2GlossML(args.tmxFile, args.glossmlFile, this.currentPreferences.catalog);
            if (args.openResult) {
                if (this.currentFile && !this.closeFile()) {
                    return;
                }
                this.openFile(args.glossmlFile);
            } else {
                dialog.showMessageBox(this.mainWindow, { type: 'info', message: Anchovy.i18n.getString('Anchovy', 'glossaryImported') });
            }
        } catch (error: unknown) {
            if (error instanceof Error) {
                dialog.showMessageBox(this.mainWindow, { type: 'error', title: Anchovy.i18n.getString('Anchovy', 'error'), message: error.message });
            }
        }
    }

    TBXtoGlossML(): void {
        this.tbxToGlossMLWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 600,
            height: 200,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.tbxToGlossMLWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/tbxToGlossML.html'));
        this.tbxToGlossMLWindow.once('ready-to-show', () => {
            this.tbxToGlossMLWindow?.show();
        });
        this.tbxToGlossMLWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.tbxToGlossMLWindow.setMenu(null);
    }

    browseTbxSource(): void {
        dialog.showOpenDialog(this.tbxToGlossMLWindow, {
            title: Anchovy.i18n.getString('Anchovy', 'tbxFile'),
            properties: ['openFile'],
            filters: [
                { name: Anchovy.i18n.getString('Anchovy', 'tbxFile'), extensions: ['tbx'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ]
        }).then((value) => {
            if (!value.canceled && value.filePaths.length > 0) {
                this.tbxToGlossMLWindow?.webContents.send('set-tbx-source', value.filePaths[0]);
            }
        }).catch((error) => {
            console.log(error);
        });
    }

    convertTbxToGlossML(args: { tbxFile: string, glossmlFile: string, openResult: boolean }): void {
        this.tbxToGlossMLWindow?.close();
        try {
            new TBX2GlossML(args.tbxFile, args.glossmlFile, this.currentPreferences.catalog);
            if (args.openResult) {
                if (this.currentFile && !this.closeFile()) {
                    return;
                }
                this.openFile(args.glossmlFile);
            } else {
                dialog.showMessageBox(this.mainWindow, { type: 'info', message: Anchovy.i18n.getString('Anchovy', 'glossaryImported') });
            }
        } catch (error: unknown) {
            if (error instanceof Error) {
                dialog.showMessageBox(this.mainWindow, { type: 'error', title: Anchovy.i18n.getString('Anchovy', 'error'), message: error.message });
            }
        }
    }

    CSVtoGlossML(): void {
        this.pendingCsvFile = '';
        this.showImportCsvDialog();
    }

    showImportCsvDialog(): void {
        this.importCsvWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 700,
            height: 500,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.importCsvWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/importCsv.html'));
        this.importCsvWindow.once('ready-to-show', () => {
            this.importCsvWindow?.show();
            this.importCsvWindow?.webContents.send('set-csv-import-data', {
                anyLanguageLabel: Anchovy.i18n.getString('importCsv', 'anyLanguage'),
                inconsistentMessage: Anchovy.i18n.getString('importCsv', 'inconsistentColumns'),
                columnLabel: Anchovy.i18n.getString('importCsv', 'columnLabel'),
                typeLabels: {
                    skip: Anchovy.i18n.getString('importCsv', 'typeSkip'),
                    comment: Anchovy.i18n.getString('importCsv', 'typeComment'),
                    term: Anchovy.i18n.getString('importCsv', 'typeTerm'),
                    definition: Anchovy.i18n.getString('importCsv', 'typeDefinition')
                },
                headerPatterns: {
                    comment: Anchovy.i18n.getString('column', 'comment'),
                    term: Anchovy.i18n.getString('column', 'term'),
                    definition: Anchovy.i18n.getString('column', 'definition')
                }
            });
        });
        this.importCsvWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.importCsvWindow.setMenu(null);
    }

    browseCsvSource(): void {
        dialog.showOpenDialog(this.importCsvWindow, {
            title: Anchovy.i18n.getString('Anchovy', 'CSVtoGlossML'),
            properties: ['openFile'],
            filters: [
                { name: Anchovy.i18n.getString('Anchovy', 'delimitedFiles'), extensions: ['csv', 'tsv', 'txt'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ]
        }).then((value) => {
            if (value.canceled || value.filePaths.length === 0) {
                return;
            }
            this.pendingCsvFile = value.filePaths[0];
            let detected: { encoding: CsvEncoding, separator: string, quote: string } = detectCsvSettings(this.pendingCsvFile);
            this.importCsvWindow?.webContents.send('set-csv-source', {
                sourceFile: this.pendingCsvFile,
                detectedEncoding: detected.encoding,
                detectedSeparator: detected.separator,
                detectedQuote: detected.quote
            });
        }).catch((error) => {
            console.log(error);
        });
    }

    getCsvPreview(event: IpcMainEvent, args: { encoding: CsvEncoding, columnSeparator: string, textDelimiter: string }): void {
        if (!this.pendingCsvFile) {
            return;
        }
        const PREVIEW_ROWS: number = 20;
        try {
            let rows: string[][] = new CsvReader().readRows(this.pendingCsvFile, args.encoding, args.columnSeparator, args.textDelimiter);
            let consistent: boolean = columnsConsistent(rows);
            event.sender.send('set-csv-preview', {
                rows: rows.slice(0, PREVIEW_ROWS),
                columnCount: rows.length > 0 ? rows[0].length : 0,
                consistent: consistent
            });
        } catch (error: unknown) {
            event.sender.send('set-csv-preview', {
                rows: [],
                columnCount: 0,
                consistent: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    doCsvImport(args: { glossmlFile: string, encoding: CsvEncoding, columnSeparator: string, textDelimiter: string, hasHeaderRow: boolean, sourceLanguage: string, columns: { action: string, lang?: string }[], openResult: boolean }): void {
        this.importCsvWindow?.close();
        try {
            new CsvImporter().convert(this.pendingCsvFile, args.glossmlFile, args.encoding, args.columnSeparator, args.textDelimiter, args.hasHeaderRow, args.sourceLanguage, args.columns as ExcelColumnMapping[]);
            if (args.openResult) {
                if (this.currentFile !== '' && !this.closeFile()) {
                    return;
                }
                this.openFile(args.glossmlFile);
            } else {
                dialog.showMessageBox(this.mainWindow, { type: 'info', message: Anchovy.i18n.getString('Anchovy', 'glossaryImported') });
            }
        } catch (error: unknown) {
            if (error instanceof Error) {
                dialog.showMessageBox(this.mainWindow, { type: 'error', title: Anchovy.i18n.getString('Anchovy', 'error'), message: error.message });
            }
        }
    }

    ExcelToGlossML(): void {
        this.pendingExcelFile = '';
        this.pendingExcelSheets = [];
        this.showImportExcelDialog();
    }

    showImportExcelDialog(): void {
        this.importExcelWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 700,
            height: 500,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.importExcelWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/importExcel.html'));
        this.importExcelWindow.once('ready-to-show', () => {
            this.importExcelWindow?.show();
            this.importExcelWindow?.webContents.send('set-import-data', {
                anyLanguageLabel: Anchovy.i18n.getString('importExcel', 'anyLanguage'),
                typeLabels: {
                    skip: Anchovy.i18n.getString('importExcel', 'typeSkip'),
                    comment: Anchovy.i18n.getString('importExcel', 'typeComment'),
                    term: Anchovy.i18n.getString('importExcel', 'typeTerm'),
                    definition: Anchovy.i18n.getString('importExcel', 'typeDefinition')
                },
                headerPatterns: {
                    comment: Anchovy.i18n.getString('column', 'comment'),
                    term: Anchovy.i18n.getString('column', 'term'),
                    definition: Anchovy.i18n.getString('column', 'definition')
                }
            });
        });
        this.importExcelWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.importExcelWindow.setMenu(null);
    }

    browseExcelSource(): void {
        dialog.showOpenDialog(this.importExcelWindow, {
            title: Anchovy.i18n.getString('Anchovy', 'ExcelToGlossML'),
            properties: ['openFile'],
            filters: [
                { name: Anchovy.i18n.getString('Anchovy', 'excelFile'), extensions: ['xlsx'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ]
        }).then((value) => {
            if (value.canceled || value.filePaths.length === 0) {
                return;
            }
            try {
                this.pendingExcelFile = value.filePaths[0];
                this.pendingExcelSheets = new ExcelReader(Anchovy.appLang).readSheets(this.pendingExcelFile);
                this.importExcelWindow?.webContents.send('set-excel-source', {
                    sourceFile: this.pendingExcelFile,
                    sheets: this.pendingExcelSheets
                });
            } catch (error: unknown) {
                if (error instanceof Error) {
                    dialog.showMessageBox(this.importExcelWindow, { type: 'error', title: Anchovy.i18n.getString('Anchovy', 'error'), message: error.message });
                }
            }
        }).catch((error) => {
            console.log(error);
        });
    }

    doExcelImport(args: { glossmlFile: string, sheetIndex: number, hasHeaderRow: boolean, sourceLanguage: string, columns: { action: string, lang?: string }[], openResult: boolean }): void {
        this.importExcelWindow?.close();
        try {
            new ExcelImporter(Anchovy.appLang).convert(this.pendingExcelFile, args.glossmlFile, args.sheetIndex, args.hasHeaderRow, args.sourceLanguage, args.columns as ExcelColumnMapping[]);
            if (args.openResult) {
                if (this.currentFile !== '' && !this.closeFile()) {
                    return;
                }
                this.openFile(args.glossmlFile);
            } else {
                dialog.showMessageBox(this.mainWindow, { type: 'info', message: Anchovy.i18n.getString('Anchovy', 'glossaryImported') });
            }
        } catch (error: unknown) {
            if (error instanceof Error) {
                dialog.showMessageBox(this.mainWindow, { type: 'error', title: Anchovy.i18n.getString('Anchovy', 'error'), message: error.message });
            }
        }
    }

    getLanguages(event: IpcMainEvent): void {
        let languages: Language[] = LanguageUtils.getLanguages(Anchovy.appLang);
        let array: { code: string, description: string }[] = [];
        array.push({ code: 'none', description: Anchovy.i18n.getString('Anchovy', 'selectLanguage') });
        for (let lang of languages) {
            array.push({ code: lang.getCode(), description: lang.getDescription() });
        }
        event.sender.send('set-languages', array);
    }

    getExistingLanguages(event: IpcMainEvent): void {
        let languages: string[] = this.model.getLanguages();
        let array: { code: string, description: string }[] = [];
        array.push({ code: 'none', description: Anchovy.i18n.getString('Anchovy', 'selectLanguage') });
        for (let lang of languages) {
            array.push({ code: lang, description: LanguageUtils.getTagDescription(lang) });
        }
        event.sender.send('set-existing-languages', array);
    }

    getSourceLanguages(event: IpcMainEvent): void {
        let languages: Language[] = LanguageUtils.getLanguages(Anchovy.appLang);
        let array: { code: string, description: string }[] = [];
        array.push({ code: '*all*', description: Anchovy.i18n.getString('Anchovy', 'anyLanguage') });
        for (let lang of languages) {
            array.push({ code: lang.getCode(), description: lang.getDescription() });
        }
        event.sender.send('set-languages', array);
    }

    saveGlossaryInfo(args: { srcLang: string, comment: string }): void {
        this.model.setSourceLanguage(args.srcLang);
        let existingComment: GlossaryComment | null = this.model.getRootComment();
        if (args.comment === '') {
            this.model.setRootComment(null);
        } else if (existingComment) {
            existingComment.setText(args.comment);
            this.model.setRootComment(existingComment);
        } else {
            this.model.setRootComment(new GlossaryComment(args.comment));
        }
        this.markModified();
        this.glossaryInfoWindow?.close();
    }

    makeNewGlossary(srcLang: string): void {
        if (this.model && !this.closeFile()) {
            return;
        }
        let doc: XMLDocument = new XMLDocument();
        let root: XMLElement = new XMLElement('glossary');
        root.setAttribute(new XMLAttribute('version', '1.0'));
        root.setAttribute(new XMLAttribute('srclang', srcLang));
        doc.setRoot(root);
        let glossEntry: XMLElement = new XMLElement('glossentry');
        root.addElement(glossEntry);

        let langEntry: XMLElement = new XMLElement('langentry');
        langEntry.setAttribute(new XMLAttribute('xml:lang', srcLang === '*all*' ? 'en' : srcLang));
        glossEntry.addElement(langEntry);

        let term: XMLElement = new XMLElement('term');
        term.addString(Anchovy.i18n.getString('newGlossary', 'newTerm'));
        langEntry.addElement(term);

        let definition: XMLElement = new XMLElement('definition');
        definition.addString(Anchovy.i18n.getString('newGlossary', 'newDefinition'));
        langEntry.addElement(definition);

        let tempFile: string = join(app.getPath('temp'), 'Untitled.gls');
        XMLWriter.writeDocument(doc, tempFile);
        this.openFile(tempFile);
        this.currentFile = '';
        unlinkSync(tempFile);
        this.markModified();
        this.mainWindow.setTitle(Anchovy.i18n.getString('Anchovy', 'untitled'));
        this.newGlossaryWindow?.close();
    }

    getCharsets(event: IpcMainEvent): void {
        try {
            let charsets: Pair[] = JSON.parse(this.runJava('openxliff/com.maxprograms.converters.EncodingResolver', ['-lang', Anchovy.appLang, '-list']).trim());
            charsets.unshift({
                code: 'none',
                description: Anchovy.i18n.getString('Anchovy', 'selectCharset')
            });
            event.sender.send('set-charsets', charsets);
        } catch (err: unknown) {
            if (err instanceof Error) {
                dialog.showMessageBox(this.mainWindow!, {
                    type: 'error',
                    title: Anchovy.i18n.getString('Anchovy', 'error'),
                    message: err.message
                });
                return;
            }
            console.error(err);
        }
    }

    getTypes(event: IpcMainEvent): void {
        try {
            let fileTypes: { type: string, description: string }[] = JSON.parse(this.runJava('openxliff/com.maxprograms.converters.FileFormats', ['-lang', Anchovy.appLang, '-list']).trim());
            fileTypes.unshift({
                type: 'none',
                description: Anchovy.i18n.getString('Anchovy', 'selectFileType')
            });
            event.sender.send('set-fileTypes', fileTypes);
        } catch (err: unknown) {
            if (err instanceof Error) {
                dialog.showMessageBox(this.mainWindow!, {
                    type: 'error',
                    title: Anchovy.i18n.getString('Anchovy', 'error'),
                    message: err.message
                });
                return;
            }
            console.error(err);
        }
    }

    runJava(module: string, arg: string[]): string {
        let javapath: string = process.platform === 'win32' ? join(app.getAppPath(), 'bin', 'java.exe') : join(app.getAppPath(), 'bin', 'java');
        let params: string[] = ['-XX:+UseCompactObjectHeaders', '--module-path', 'lib', '-m', module];
        if (arg) {
            params = params.concat(arg);
        }
        let ls: SpawnSyncReturns<Buffer> = spawnSync(javapath, params, { cwd: app.getAppPath(), windowsHide: true });
        let stdout: Buffer = ls.stdout;
        let stderr: Buffer = ls.stderr;
        if (stderr.length > 0) {
            if (stderr.toString().indexOf('SEVERE:') !== -1) {
                throw new Error(stderr.toString());
            }
            return stderr.toString();
        }
        return stdout.toString();
    }

    browseSourceFile(): void {
        let extensions: string[] = ['icml', 'inx', 'idml', 'ditamap', 'dita', 'xml', 'htm', 'html', 'js', 'properties',
            'json', 'md', 'mif', 'docx', 'xlsx', 'pptx', 'sxw', 'sxc', 'sxi', 'sxd', 'odt', 'ods', 'odp', 'odg', 'php',
            'txt', 'zip', 'rc', 'resx', 'srt', 'svg', 'vsdx', 'vtt'];
        let filters: any[] = [
            { name: Anchovy.i18n.getString('FileFormats', 'supportedFiles'), extensions: extensions },
            { name: Anchovy.i18n.getString('FileFormats', 'anyFile'), extensions: ['*'] }
        ];
        dialog.showOpenDialog({
            title: Anchovy.i18n.getString('Anchovy', 'sourceFile'),
            properties: ['openFile'],
            filters: filters
        }).then((value) => {
            if (!value.canceled) {
                this.extractTermsWindow?.webContents.send('set-source-file', value.filePaths[0]);
                this.getFileType(value.filePaths[0]);
            }
        }).catch((error) => {
            console.error(error);
        });
    }

    browsePreferencesCatalog(): void {
        let defaultPath: string = this.currentPreferences.catalog || join(app.getAppPath(), 'catalog', 'catalog.xml');
        dialog.showOpenDialog(this.preferencesDialogWindow, {
            title: 'System Catalog',
            properties: ['openFile'],
            filters: [
                { name: 'Catalog', extensions: ['xml'] },
                { name: Anchovy.i18n.getString('Anchovy', 'anyFile'), extensions: ['*'] }
            ],
            defaultPath: defaultPath
        }).then((value) => {
            if (!value.canceled && value.filePaths.length > 0) {
                this.preferencesDialogWindow?.webContents.send('set-preferences-catalog', value.filePaths[0]);
            }
        }).catch((error) => {
            console.error(error);
        });
    }

    getFileType(file: string): void {
        try {
            let result: string = this.runJava('openxliff/com.maxprograms.converters.FileFormats', ['-file', file]);
            let parsed: any = JSON.parse(result);
            this.extractTermsWindow?.webContents.send('set-file-type', parsed.format);
            if (parsed.format !== 'Unknown') {
                result = this.runJava('openxliff/com.maxprograms.converters.EncodingResolver', ['-file', file, '-type', parsed.format]);
                parsed = JSON.parse(result);
                this.extractTermsWindow?.webContents.send('set-encoding', parsed.encoding);
            }
        } catch (err: unknown) {
            if (err instanceof Error) {
                dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), err.message);
                return;
            }
            console.error(err);
        }
    }

    extractCandidateTerms(sourceFile: string, fileType: string, encoding: string, language: string, frequency: number, termLength: number, glossmlFile: string): void {
        this.mainWindow.webContents.send('set-status', Anchovy.i18n.getString('Anchovy', 'preparingFiles'));
        let dataFolder: string = app.getPath('appData');
        let tempFolder: string = join(dataFolder, app.name, 'temp');
        if (!existsSync(tempFolder)) {
            mkdirSync(tempFolder, { recursive: true });
        }
        let xliffFile: string = join(tempFolder, 'term_extraction.xlf');

        let file: any = {
            source: sourceFile,
            xliff: xliffFile,
            type: fileType,
            enc: encoding,
            srcLang: language,
            tgtLang: language,
            is22: true,
            paragraph: true,
            ignoresvg: true,
            embed: true
        }
        let json: any = {
            files: [file]
        }
        try {
            let jsonFile: string = join(app.getPath('temp'), 'convert.json');
            writeFileSync(jsonFile, JSON.stringify(json, null, 2));

            this.runJava('openxliff/com.maxprograms.converters.Convert', ['-lang', Anchovy.appLang, '-json', jsonFile]);
            try {
                unlinkSync(jsonFile);
            } catch (err) {
                console.error('Error deleting temporary files: ' + err);
            }

            this.mainWindow.webContents.send('set-status', Anchovy.i18n.getString('Anchovy', 'extractingTerms'));

            let candidatesFile: string = join(tempFolder, 'candidate_terms.csv');

            const extractor: TermExtractor = new TermExtractor(xliffFile, termLength, frequency, 100, true, Anchovy.appLang);
            extractor.writeCsv(candidatesFile);

            this.openCandidatesViewer(language, glossmlFile);
            this.mainWindow.webContents.send('set-status', '');
        } catch (err: unknown) {
            this.mainWindow.webContents.send('set-status', '');
            if (err instanceof Error) {
                dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), err.message);
                return;
            }
            console.error(err);
        }
    }

    createGlossary(terms: string[], srcLang: string, glossmlFile: string, openResult: boolean): void {
        this.makeGlossary(terms, srcLang, glossmlFile);
        this.candidatesViewerWindow?.close();
        if (openResult) {
            if (this.currentFile && !this.closeFile()) {
                return;
            }
            this.openFile(glossmlFile);
        } else {
            dialog.showMessageBox(this.mainWindow, { type: 'info', message: Anchovy.i18n.getString('Anchovy', 'glossaryImported') });
        }
    }

    makeGlossary(terms: string[], srcLang: string, filePath: string): void {
        let glossaryDoc: XMLDocument = new XMLDocument();
        glossaryDoc.setXmlDeclaration(new XMLDeclaration('1.0', 'UTF-8', 'no'));
        glossaryDoc.addTextNode(new TextNode('\n'));
        let glossaryElement: XMLElement = new XMLElement('glossary');
        glossaryElement.setAttribute(new XMLAttribute('srclang', srcLang));
        glossaryElement.setAttribute(new XMLAttribute('version', '1.0'));
        glossaryElement.setAttribute(new XMLAttribute('xmlns', 'http://maxprograms.com/gml'));
        glossaryElement.setAttribute(new XMLAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance'));
        glossaryDoc.setRoot(glossaryElement);
        for (let termText of terms) {
            let glossEntry: XMLElement = new XMLElement('glossentry');
            let langEntry: XMLElement = new XMLElement('langentry');
            langEntry.setAttribute(new XMLAttribute('xml:lang', srcLang));
            let termElement: XMLElement = new XMLElement('term');
            termElement.addString(termText);
            langEntry.addElement(termElement);
            glossEntry.addElement(langEntry);
            glossaryElement.addElement(glossEntry);
        }
        const indenter: Indenter = new Indenter(2);
        indenter.indent(glossaryElement);
        XMLWriter.writeDocument(glossaryDoc, filePath);
    }

    showFileProperties(): void {
        if (!(this.model && this.currentFile)) {
            return;
        }
        this.glossaryInfoWindow = new BrowserWindow({
            parent: this.mainWindow,
            width: 400,
            height: 300,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: join(app.getAppPath(), 'images', 'anchovy.png')
        });
        this.glossaryInfoWindow.loadFile(join(dirname(fileURLToPath(import.meta.url)), '../html/', Anchovy.appLang, '/glossaryInfo.html'));
        this.glossaryInfoWindow.once('ready-to-show', () => {
            this.glossaryInfoWindow?.show();
        });
        this.glossaryInfoWindow.on('closed', () => {
            this.mainWindow?.focus();
        });
        this.glossaryInfoWindow.setMenu(null);
    }

    getGlossaryInfo(): void {
        if (!this.model) {
            return;
        }
        let srcLang: string = this.model.getSourceLanguage();
        let languagesList: string[] = this.model.getLanguages();
        let numEntries: number = this.model.getEntryCount();
        let glossaryComment: GlossaryComment | null = this.model.getRootComment();

        let languages: string = '';
        for (let lang of languagesList) {
            if (languages !== '') {
                languages = languages + ', ';
            }
            languages = languages + lang;
        }
        let comment: string = '';
        if (glossaryComment) {
            comment = glossaryComment.getText();
        }
        this.glossaryInfoWindow?.webContents.send('set-glossary-info', {
            srcLang: srcLang,
            languages: languages.trim(),
            termCount: numEntries,
            comment: comment
        });
    }

    showStore(): void {
        shell.openExternal('https://maxprograms.com/store/buy.html').catch((reason: any) => {
            if (reason instanceof Error) {
                console.error(reason.message);
            }
            dialog.showErrorBox(Anchovy.i18n.getString('Anchovy', 'error'), Anchovy.i18n.getString('Anchovy', 'unableToOpenStore'));
        });
    }
}

// Initialize the application
try {
    new Anchovy();
} catch (error) {
    console.error('Error initializing the application: ' + error);
}
