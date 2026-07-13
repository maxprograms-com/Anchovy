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

import { appendFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LanguageUtils } from 'typesbcp47';
import { ExcelSheet, ExcelWriter } from 'typesexcel';
import { Indenter, SAXParser, XMLAttribute, XMLDeclaration, XMLDocumentType, XMLElement } from 'typesxml';
import { I18n } from '../i18n.js';
import { Column, ColumnTypes } from './columnTypes.js';
import { GlossaryComment } from './glossaryComment.js';
import { GlossaryDefinition } from './glossaryDefinition.js';
import { GlossaryEntry } from './glossaryEntry.js';
import { GlossaryHandler } from './glossaryHandler.js';
import { GlossaryLangEntry } from './glossaryLangEntry.js';
import { GlossaryTerm } from './glossaryTerm.js';

export class GlossaryModel {
    private databasePath: string;
    private database: DatabaseSync;
    private columns: Column[];
    private xmlDeclaration: XMLDeclaration;
    private sourceLanguage: string;
    private rootComment: GlossaryComment | null;
    private sourceFile: string;
    private i18n: I18n;
    private messagesPath: string;
    private language: string;
    private saved: boolean = true;

    constructor(databasePath: string, sourceFile: string, messagesPath: string, language: string) {
        this.databasePath = databasePath;
        this.columns = [];
        this.xmlDeclaration = new XMLDeclaration('1.0', 'UTF-8');
        this.sourceLanguage = '';
        this.rootComment = null;
        this.sourceFile = sourceFile;
        this.messagesPath = messagesPath;
        this.language = language;
        this.i18n = new I18n(messagesPath);
        this.ensureDatabaseFolder();
        this.removeExistingDatabase();
        this.database = new DatabaseSync(this.databasePath, {
            enableForeignKeyConstraints: true,
            timeout: 5000
        });
        this.createSchema();
        this.registerSearchFunction();
        try {
            this.importFile();
        } catch (error) {
            this.close();
            throw error;
        }
        this.saved = true;
    }

    private registerSearchFunction(): void {
        this.database.function('TEXT_MATCHES', { deterministic: true }, (value: unknown, pattern: unknown, caseSensitive: unknown) => {
            try {
                let regex: RegExp = new RegExp(String(pattern), caseSensitive ? '' : 'i');
                return regex.test(value === null || value === undefined ? '' : String(value)) ? 1 : 0;
            } catch (error) {
                return 0;
            }
        });
        this.database.function('TEXT_MATCH_COUNT', { deterministic: true }, (value: unknown, pattern: unknown, caseSensitive: unknown) => {
            try {
                let regex: RegExp = new RegExp(String(pattern), (caseSensitive ? '' : 'i') + 'g');
                let matches: RegExpMatchArray | null = (value === null || value === undefined ? '' : String(value)).match(regex);
                return matches ? matches.length : 0;
            } catch (error) {
                return 0;
            }
        });
        this.database.function('TEXT_REPLACE', { deterministic: true }, (value: unknown, pattern: unknown, caseSensitive: unknown, replacement: unknown) => {
            let original: string = value === null || value === undefined ? '' : String(value);
            try {
                let regex: RegExp = new RegExp(String(pattern), (caseSensitive ? '' : 'i') + 'g');
                return original.replace(regex, String(replacement));
            } catch (error) {
                return original;
            }
        });
    }

    private escapeRegExp(text: string): string {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    setSourceFile(sourceFile: string): void {
        this.sourceFile = sourceFile;
    }

    getSourceFile(): string {
        return this.sourceFile;
    }

    getSourceLanguage(): string {
        return this.sourceLanguage;
    }

    setSourceLanguage(sourceLanguage: string): void {
        this.sourceLanguage = sourceLanguage;
        this.saved = false;
    }

    getRootComment(): GlossaryComment | null {
        if (!this.rootComment) {
            return null;
        }
        return this.rootComment;
    }

    getEntryCount(): number {
        let row: Record<string, unknown> | undefined = this.database.prepare('SELECT COUNT(*) AS total FROM gloss_entries').get();
        if (!row) {
            return 0;
        }
        return Number(row['total']);
    }

    getColumns(): Column[] {
        return this.columns;
    }

    addColumn(column: Column): void {
        let normalizedColumn: Column = this.normalizeColumn(column);
        if (this.hasColumn(normalizedColumn)) {
            return;
        }
        let position: number = this.getNextColumnPosition();
        this.database.prepare('INSERT INTO gloss_columns (position, type, lang) VALUES (?, ?, ?)').run(position, normalizedColumn.type, normalizedColumn.lang || null);
        this.columns.push(normalizedColumn);
        this.columns = this.sortColumns(this.columns);
        this.saved = false;
    }

    sortColumns(columns: Column[]): Column[] {
        columns.sort((first: Column, second: Column) => {
            // comment column should always be first
            if (first.type === ColumnTypes.COMMENT) {
                return -1;
            }
            if (second.type === ColumnTypes.COMMENT) {
                return 1;
            }
            // remaining column are ordered by language description, terms go first, followed by definition if present
            let firstLangDescription: string = first.lang ? LanguageUtils.getTagDescription(first.lang) : '';
            let secondLangDescription: string = second.lang ? LanguageUtils.getTagDescription(second.lang) : '';
            if (firstLangDescription === secondLangDescription) {
                if (first.type === second.type) {
                    return 0;
                }
                if (first.type === ColumnTypes.TERM) {
                    return -1;
                }
                if (first.type === ColumnTypes.DEFINITION) {
                    return 1;
                }
            }
            if (firstLangDescription < secondLangDescription) {
                return -1;
            }
            if (firstLangDescription > secondLangDescription) {
                return 1;
            }
            return 0;
        });
        return columns;
    }

    removeColumn(column: Column): void {
        let normalizedColumn: Column = this.normalizeColumn(column);
        this.database.exec('BEGIN');
        try {
            if (normalizedColumn.type === ColumnTypes.COMMENT) {
                this.database.exec('DELETE FROM gloss_entry_comment_attributes');
                this.database.exec('DELETE FROM gloss_entry_comments');
                this.database.prepare('DELETE FROM gloss_columns WHERE type = ?').run(ColumnTypes.COMMENT);
            } else if (normalizedColumn.type === ColumnTypes.DEFINITION && normalizedColumn.lang) {
                this.database.prepare('DELETE FROM gloss_definition_attributes WHERE lang_entry_id IN (SELECT id FROM gloss_lang_entries WHERE lang = ?)').run(normalizedColumn.lang);
                this.database.prepare('DELETE FROM gloss_definitions WHERE lang_entry_id IN (SELECT id FROM gloss_lang_entries WHERE lang = ?)').run(normalizedColumn.lang);
                this.database.prepare('DELETE FROM gloss_columns WHERE type = ? AND lang = ?').run(ColumnTypes.DEFINITION, normalizedColumn.lang);
            } else if (normalizedColumn.type === ColumnTypes.TERM && normalizedColumn.lang) {
                this.database.prepare('DELETE FROM gloss_term_attributes WHERE lang_entry_id IN (SELECT id FROM gloss_lang_entries WHERE lang = ?)').run(normalizedColumn.lang);
                this.database.prepare('DELETE FROM gloss_terms WHERE lang_entry_id IN (SELECT id FROM gloss_lang_entries WHERE lang = ?)').run(normalizedColumn.lang);
                this.database.prepare('DELETE FROM gloss_columns WHERE type = ? AND lang = ?').run(ColumnTypes.TERM, normalizedColumn.lang);
            }

            this.compactColumnPositions();
            this.database.exec('COMMIT');
        } catch (error) {
            if (this.database.isTransaction) {
                this.database.exec('ROLLBACK');
            }
            throw error;
        }

        this.loadColumnsFromDatabase();
        this.saved = false;
    }

    updateCell(entryId: number, column: Column, value: string): void {
        let normalizedColumn: Column = this.normalizeColumn(column);

        this.database.exec('BEGIN');
        try {
            if (normalizedColumn.type === ColumnTypes.COMMENT) {
                this.updateCommentCell(entryId, value);
            } else if (normalizedColumn.type === ColumnTypes.TERM && normalizedColumn.lang) {
                this.updateTermCell(this.resolveLangEntryId(entryId, normalizedColumn.lang), entryId, normalizedColumn.lang, value);
            } else if (normalizedColumn.type === ColumnTypes.DEFINITION && normalizedColumn.lang) {
                this.updateDefinitionCell(this.resolveLangEntryId(entryId, normalizedColumn.lang), entryId, normalizedColumn.lang, value);
            }

            this.database.exec('COMMIT');
        } catch (error) {
            if (this.database.isTransaction) {
                this.database.exec('ROLLBACK');
            }
            throw error;
        }
        this.saved = false;
    }

    setXmlDeclaration(declaration: XMLDeclaration): void {
        this.xmlDeclaration = declaration;
    }

    private importFile(): void {
        this.database.exec('BEGIN');
        try {
            let parser: SAXParser = new SAXParser();
            parser.setSchemaLoadingEnabled(false);
            parser.setValidating(false);
            parser.setContentHandler(new GlossaryHandler(this, this.messagesPath));
            parser.parseFile(this.sourceFile);
            this.initializeColumnsFromData();
            this.database.exec('COMMIT');
        } catch (error) {
            if (this.database.isTransaction) {
                this.database.exec('ROLLBACK');
            }
            throw error;
        }
    }

    exportToGlossML(filePath: string): void {
        let batchSize: number = 1000;
        let entryCount: number = this.getEntryCount();
        let offset: number = 0;
        let fileEncoding: BufferEncoding = this.getFileEncoding();

        writeFileSync(filePath, this.xmlDeclaration.toString() + '\n', fileEncoding);
        appendFileSync(filePath, this.createGlossaryStartTag() + '\n', fileEncoding);

        if (this.rootComment) {
            appendFileSync(filePath, '  ' + this.rootComment.toElement().toString() + '\n', fileEncoding);
        }

        let indenter: Indenter = new Indenter(2, 2);
        while (offset < entryCount) {
            let entryRows: GlossaryEntry[] = this.getRows(batchSize, offset, null, undefined, true);
            for (let row of entryRows) {
                if (row.langEntries.length === 0) {
                    continue;
                }
                let element: XMLElement = row.toElement();
                indenter.indent(element);
                appendFileSync(filePath, '  ' + element.toString() + '\n', fileEncoding);
            }
            offset = offset + entryRows.length;
        }

        appendFileSync(filePath, '</glossary>\n', fileEncoding);
        this.saved = true;
    }

    exportExcel(filePath: string): void {
        let batchSize: number = 1000;
        let entryCount: number = this.getEntryCount();
        let offset: number = 0;
        let headers: string[] = this.columns.map((column: Column) => column.description);
        let rows: string[][] = [];

        while (offset < entryCount) {
            let batch: { id: number, values: string[] }[] = this.getRowValues(batchSize, offset, null, undefined, true);
            for (let row of batch) {
                rows.push(row.values);
            }
            offset = offset + batch.length;
        }

        let sheet: ExcelSheet = new ExcelSheet(this.i18n.getString('GlossaryModel', 'excelSheetName'), headers, rows);
        new ExcelWriter(this.language).writeFile(filePath, sheet);
    }

    exportCSV(filePath: string): void {
        let batchSize: number = 1000;
        let entryCount: number = this.getEntryCount();
        let offset: number = 0;
        let headers: string[] = this.columns.map((column: Column) => column.description);

        writeFileSync(filePath, headers.map((header: string) => this.csvField(header)).join(',') + '\r\n', 'utf8');

        while (offset < entryCount) {
            let batch: { id: number, values: string[] }[] = this.getRowValues(batchSize, offset, null, undefined, true);
            let lines: string = '';
            for (let row of batch) {
                lines += row.values.map((value: string) => this.csvField(value)).join(',') + '\r\n';
            }
            appendFileSync(filePath, lines, 'utf8');
            offset = offset + batch.length;
        }
    }

    private csvField(value: string): string {
        let normalized: string = (value ?? '').replace(/\r\n|\r|\n/g, ' ');
        return '"' + normalized.replace(/"/g, '""') + '"';
    }

    private buildSortClause(sortType: ColumnTypes | null, sortLang: string | undefined, sortAscending: boolean): { clause: string, params: string[] } {
        if (!sortType) {
            return { clause: 'e.position', params: [] };
        }
        let direction: string = sortAscending ? 'ASC' : 'DESC';
        if (sortType === ColumnTypes.COMMENT) {
            return {
                clause: "COALESCE((SELECT c.text FROM gloss_entry_comments c WHERE c.entry_id = e.id), '') " + direction + ', e.position',
                params: []
            };
        }
        let valueTable: string = sortType === ColumnTypes.TERM ? 'gloss_terms' : 'gloss_definitions';
        return {
            clause: ''
                + "COALESCE(( "
                + '    SELECT v.text '
                + '    FROM gloss_lang_entries le '
                + '    LEFT JOIN ' + valueTable + ' v ON v.lang_entry_id = le.id '
                + '    WHERE le.entry_id = e.id AND le.lang = ? '
                + '    ORDER BY le.position '
                + '    LIMIT 1 '
                + "), '') " + direction + ', e.position',
            params: [sortLang ?? '']
        };
    }

    getRows(limit: number, offset: number, sortType: ColumnTypes | null, sortLang: string | undefined, sortAscending: boolean): GlossaryEntry[] {
        let safeLimit: number = Math.max(0, Math.floor(limit));
        let safeOffset: number = Math.max(0, Math.floor(offset));
        let sort: { clause: string, params: string[] } = this.buildSortClause(sortType, sortLang, sortAscending);
        let sql: string = 'SELECT e.id FROM gloss_entries e ORDER BY ' + sort.clause + ' LIMIT ? OFFSET ?';
        let rows: Record<string, unknown>[] = this.database.prepare(sql).all(...sort.params, safeLimit, safeOffset);

        let result: GlossaryEntry[] = [];
        for (let row of rows) {
            result.push(this.loadEntryRow(Number(row['id'])));
        }
        return result;
    }

    isModified(): boolean {
        return !this.saved;
    }

    close(): void {
        if (this.database.isOpen) {
            this.database.close();
        }
    }

    addEntry(afterEntryId?: number): number {
        this.database.exec('BEGIN');
        try {
            let position: number;
            let afterRow: Record<string, unknown> | undefined = afterEntryId !== undefined
                ? this.database.prepare('SELECT position FROM gloss_entries WHERE id = ?').get(afterEntryId)
                : undefined;
            if (afterRow) {
                position = Number(afterRow['position']) + 1;
                this.database.prepare('UPDATE gloss_entries SET position = position + 1 WHERE position >= ?').run(position);
            } else {
                position = this.getNextEntryPosition();
            }
            let result = this.database.prepare('INSERT INTO gloss_entries (position) VALUES (?)').run(position);
            this.database.exec('COMMIT');
            this.saved = false;
            return Number(result.lastInsertRowid);
        } catch (error) {
            if (this.database.isTransaction) {
                this.database.exec('ROLLBACK');
            }
            throw error;
        }
    }

    private getNextEntryPosition(): number {
        let row: Record<string, unknown> | undefined = this.database.prepare('SELECT COALESCE(MAX(position), -1) AS maxPosition FROM gloss_entries').get();
        return (row ? Number(row['maxPosition']) : -1) + 1;
    }

    getEntryRow(entryId: number): number {
        let row: Record<string, unknown> | undefined = this.database.prepare(
            'SELECT COUNT(*) AS total FROM gloss_entries WHERE position < (SELECT position FROM gloss_entries WHERE id = ?)'
        ).get(entryId);
        return row ? Number(row['total']) : 0;
    }

    removeEntry(entryId: number): void {
        this.database.exec('BEGIN');
        try {
            this.database.prepare('DELETE FROM gloss_entries WHERE id = ?').run(entryId);
            this.database.exec('COMMIT');
            this.saved = false;
        } catch (error) {
            if (this.database.isTransaction) {
                this.database.exec('ROLLBACK');
            }
            throw error;
        }
    }

    getRowValues(limit: number, offset: number, sortType: ColumnTypes | null, sortLang: string | undefined, sortAscending: boolean): { id: number, values: string[] }[] {
        let safeLimit: number = Math.max(0, Math.floor(limit));
        let safeOffset: number = Math.max(0, Math.floor(offset));
        let sort: { clause: string, params: string[] } = this.buildSortClause(sortType, sortLang, sortAscending);
        let sql: string = 'SELECT e.id FROM gloss_entries e ORDER BY ' + sort.clause + ' LIMIT ? OFFSET ?';
        let rows: Record<string, unknown>[] = this.database.prepare(sql).all(...sort.params, safeLimit, safeOffset);
        let entryIds: number[] = [];
        for (let row of rows) {
            entryIds.push(Number(row['id']));
        }
        return this.loadBulkRowValues(entryIds);
    }

    searchText(text: string, startRow: number, startColumn: number, caseSensitive: boolean, useRegex: boolean): { entryId: number, row: number, column: number } | null {
        if (this.columns.length === 0) {
            return null;
        }
        let pattern: string = useRegex ? text : this.escapeRegExp(text);
        let caseArg: number = caseSensitive ? 1 : 0;

        let branches: string[] = [];
        let matchParams: (string | number)[] = [];
        for (let columnIndex = 0; columnIndex < this.columns.length; columnIndex++) {
            let column: Column = this.columns[columnIndex];
            if (column.type === ColumnTypes.COMMENT) {
                branches.push('SELECT c.entry_id AS entry_id, ' + columnIndex + ' AS column_index FROM gloss_entry_comments c WHERE TEXT_MATCHES(c.text, ?, ?)');
                matchParams.push(pattern, caseArg);
            } else if (column.type === ColumnTypes.TERM && column.lang) {
                branches.push('SELECT le.entry_id AS entry_id, ' + columnIndex + ' AS column_index FROM gloss_lang_entries le JOIN gloss_terms t ON t.lang_entry_id = le.id WHERE le.lang = ? AND TEXT_MATCHES(t.text, ?, ?)');
                matchParams.push(column.lang, pattern, caseArg);
            } else if (column.type === ColumnTypes.DEFINITION && column.lang) {
                branches.push('SELECT le.entry_id AS entry_id, ' + columnIndex + ' AS column_index FROM gloss_lang_entries le JOIN gloss_definitions d ON d.lang_entry_id = le.id WHERE le.lang = ? AND TEXT_MATCHES(d.text, ?, ?)');
                matchParams.push(column.lang, pattern, caseArg);
            }
        }
        if (branches.length === 0) {
            return null;
        }

        let sql: string = ''
            + 'WITH ranked AS ('
            + '    SELECT e.id AS entry_id, ROW_NUMBER() OVER ('
            + '        ORDER BY COALESCE(('
            + '            SELECT t.text FROM gloss_lang_entries le'
            + '            LEFT JOIN gloss_terms t ON t.lang_entry_id = le.id'
            + '            WHERE le.entry_id = e.id AND le.lang = ?'
            + '            ORDER BY le.position LIMIT 1'
            + "        ), ''), e.id"
            + '    ) - 1 AS row_position'
            + '    FROM gloss_entries e'
            + '), matches AS ('
            + branches.join(' UNION ALL ')
            + ') '
            + 'SELECT r.entry_id AS entry_id, r.row_position AS row_position, m.column_index AS column_index '
            + 'FROM matches m JOIN ranked r ON r.entry_id = m.entry_id '
            + 'ORDER BY '
            + '    CASE WHEN (r.row_position > ? OR (r.row_position = ? AND m.column_index >= ?)) THEN 0 ELSE 1 END, '
            + '    r.row_position, m.column_index '
            + 'LIMIT 1';

        let params: (string | number)[] = [this.sourceLanguage, ...matchParams, startRow, startRow, startColumn];
        let row: Record<string, unknown> | undefined = this.database.prepare(sql).get(...params as [string | number, ...(string | number)[]]);
        if (!row) {
            return null;
        }
        return { entryId: Number(row['entry_id']), row: Number(row['row_position']), column: Number(row['column_index']) };
    }

    replaceAll(searchText: string, replaceText: string, caseSensitive: boolean, useRegex: boolean): number {
        let pattern: string = useRegex ? searchText : this.escapeRegExp(searchText);
        let caseArg: number = caseSensitive ? 1 : 0;
        let totalReplacements: number = 0;

        this.database.exec('BEGIN');
        try {
            for (let column of this.columns) {
                if (column.type === ColumnTypes.COMMENT) {
                    let countRow: Record<string, unknown> | undefined = this.database.prepare(
                        'SELECT COALESCE(SUM(TEXT_MATCH_COUNT(text, ?, ?)), 0) AS total FROM gloss_entry_comments'
                    ).get(pattern, caseArg);
                    totalReplacements += Number(countRow ? countRow['total'] : 0);
                    this.database.prepare(
                        'UPDATE gloss_entry_comments SET text = TEXT_REPLACE(text, ?, ?, ?) WHERE TEXT_MATCHES(text, ?, ?)'
                    ).run(pattern, caseArg, replaceText, pattern, caseArg);
                } else if (column.type === ColumnTypes.TERM && column.lang) {
                    let countRow: Record<string, unknown> | undefined = this.database.prepare(
                        'SELECT COALESCE(SUM(TEXT_MATCH_COUNT(t.text, ?, ?)), 0) AS total '
                        + 'FROM gloss_terms t JOIN gloss_lang_entries le ON le.id = t.lang_entry_id '
                        + 'WHERE le.lang = ?'
                    ).get(pattern, caseArg, column.lang);
                    totalReplacements += Number(countRow ? countRow['total'] : 0);
                    this.database.prepare(
                        'UPDATE gloss_terms SET text = TEXT_REPLACE(text, ?, ?, ?) '
                        + 'WHERE lang_entry_id IN (SELECT id FROM gloss_lang_entries WHERE lang = ?) AND TEXT_MATCHES(text, ?, ?)'
                    ).run(pattern, caseArg, replaceText, column.lang, pattern, caseArg);
                } else if (column.type === ColumnTypes.DEFINITION && column.lang) {
                    let countRow: Record<string, unknown> | undefined = this.database.prepare(
                        'SELECT COALESCE(SUM(TEXT_MATCH_COUNT(d.text, ?, ?)), 0) AS total '
                        + 'FROM gloss_definitions d JOIN gloss_lang_entries le ON le.id = d.lang_entry_id '
                        + 'WHERE le.lang = ?'
                    ).get(pattern, caseArg, column.lang);
                    totalReplacements += Number(countRow ? countRow['total'] : 0);
                    this.database.prepare(
                        'UPDATE gloss_definitions SET text = TEXT_REPLACE(text, ?, ?, ?) '
                        + 'WHERE lang_entry_id IN (SELECT id FROM gloss_lang_entries WHERE lang = ?) AND TEXT_MATCHES(text, ?, ?)'
                    ).run(pattern, caseArg, replaceText, column.lang, pattern, caseArg);
                }
            }
            this.database.exec('COMMIT');
        } catch (error) {
            if (this.database.isTransaction) {
                this.database.exec('ROLLBACK');
            }
            throw error;
        }

        if (totalReplacements > 0) {
            this.saved = false;
        }
        return totalReplacements;
    }

    setRootAttributes(attributes: XMLAttribute[]): void {
        for (let attribute of attributes) {
            if (attribute.getName() === 'srclang') {
                this.sourceLanguage = attribute.getValue();
                break;
            }
        }
    }

    setRootComment(comment: GlossaryComment | null): void {
        this.rootComment = comment;
        this.saved = false;
    }

    storeGlossEntry(element: XMLElement): void {
        let insertEntry = this.database.prepare('INSERT INTO gloss_entries (position) VALUES (?)');
        let result = insertEntry.run(this.getNextEntryPosition());
        let entryId: number = Number(result.lastInsertRowid);

        this.insertAttributes('gloss_entry_attributes', 'entry_id', entryId, element.getAttributes());

        let children: XMLElement[] = element.getChildren();
        let langEntryPosition: number = 0;
        for (let i = 0; i < children.length; i++) {
            let child: XMLElement = children[i];
            if (child.getName() === 'comment') {
                this.database.prepare('INSERT INTO gloss_entry_comments (entry_id, text) VALUES (?, ?)').run(entryId, child.getText());
                this.insertAttributes('gloss_entry_comment_attributes', 'entry_id', entryId, child.getAttributes());
                continue;
            }

            if (child.getName() !== 'langentry') {
                continue;
            }

            let langAttribute: XMLAttribute | null = child.getAttribute('xml:lang');
            if (!langAttribute) {
                continue;
            }

            let lang: string = langAttribute.getValue();
            let langEntryResult = this.database.prepare('INSERT INTO gloss_lang_entries (entry_id, lang, position) VALUES (?, ?, ?)').run(entryId, lang, langEntryPosition);
            let langEntryId: number = Number(langEntryResult.lastInsertRowid);
            langEntryPosition = langEntryPosition + 1;
            this.insertAttributes('gloss_lang_entry_attributes', 'lang_entry_id', langEntryId, this.filterAttributes(child.getAttributes(), 'xml:lang'));

            let termElement: XMLElement | null = child.getChild('term');
            if (termElement) {
                this.database.prepare('INSERT INTO gloss_terms (lang_entry_id, text) VALUES (?, ?)').run(langEntryId, termElement.getText());
                this.insertAttributes('gloss_term_attributes', 'lang_entry_id', langEntryId, termElement.getAttributes());
            }

            let definitionElement: XMLElement | null = child.getChild('definition');
            if (definitionElement) {
                let sourceAttribute: XMLAttribute | null = definitionElement.getAttribute('source');
                let source: string = sourceAttribute ? sourceAttribute.getValue() : '';
                this.database.prepare('INSERT INTO gloss_definitions (lang_entry_id, text, source) VALUES (?, ?, ?)').run(langEntryId, definitionElement.getText(), source);
                this.insertAttributes('gloss_definition_attributes', 'lang_entry_id', langEntryId, this.filterAttributes(definitionElement.getAttributes(), 'source'));
            }
        }
    }

    private createGlossaryStartTag(): string {
        let glossaryElement: XMLElement = new XMLElement('glossary');
        glossaryElement.setAttributes([
            new XMLAttribute('version', '1.0'),
            new XMLAttribute('srclang', this.sourceLanguage),
            new XMLAttribute('xmlns', 'http://maxprograms.com/gml'),
            new XMLAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance')
        ]);
        return glossaryElement.getHead();
    }

    private getFileEncoding(): BufferEncoding {
        let normalizedEncoding: string = this.xmlDeclaration.getEncoding().toUpperCase();
        if (normalizedEncoding === 'UTF-8' || normalizedEncoding === 'UTF8') {
            return 'utf8';
        }
        if (normalizedEncoding === 'UTF-16' || normalizedEncoding === 'UTF-16LE' || normalizedEncoding === 'UTF16' || normalizedEncoding === 'UTF16LE') {
            return 'utf16le';
        }
        throw new Error(this.i18n.format(this.i18n.getString('GlossaryModel', 'unsupportedXmlEncoding'), [this.xmlDeclaration.getEncoding()]));
    }

    private initializeColumnsFromData(): void {
        let columns: Column[] = [];
        let commentRow: Record<string, unknown> | undefined = this.database.prepare('SELECT COUNT(*) AS total FROM gloss_entry_comments').get();
        if (commentRow && Number(commentRow['total']) > 0) {
            columns.push(this.createColumn(ColumnTypes.COMMENT, undefined));
        }

        let termRows: Record<string, unknown>[] = this.database.prepare('SELECT DISTINCT le.lang FROM gloss_terms t JOIN gloss_lang_entries le ON le.id = t.lang_entry_id ORDER BY le.lang').all();
        let definitionRows: Record<string, unknown>[] = this.database.prepare('SELECT DISTINCT le.lang FROM gloss_definitions d JOIN gloss_lang_entries le ON le.id = d.lang_entry_id ORDER BY le.lang').all();
        let definitionSet: Set<string> = new Set<string>();

        for (let row of definitionRows) {
            definitionSet.add(String(row['lang']));
        }

        let sortedLanguages: string[] = [];
        for (let row of termRows) {
            sortedLanguages.push(String(row['lang']));
        }
        sortedLanguages.sort((first: string, second: string) => {
            return LanguageUtils.getTagDescription(first).localeCompare(LanguageUtils.getTagDescription(second));
        });

        for (let lang of sortedLanguages) {
            columns.push(this.createColumn(ColumnTypes.TERM, lang));
            if (definitionSet.has(lang)) {
                columns.push(this.createColumn(ColumnTypes.DEFINITION, lang));
            }
        }

        this.columns = columns;
        this.persistColumns();
    }

    private hasColumn(column: Column): boolean {
        for (let currentColumn of this.columns) {
            if (this.sameColumn(currentColumn, column)) {
                return true;
            }
        }
        return false;
    }

    private sameColumn(first: Column, second: Column): boolean {
        return first.type === second.type && first.lang === second.lang;
    }

    private ensureDatabaseFolder(): void {
        let folder: string = dirname(this.databasePath);
        if (!existsSync(folder)) {
            mkdirSync(folder, { recursive: true });
        }
    }

    private removeExistingDatabase(): void {
        let databaseFiles: string[] = [
            this.databasePath,
            this.databasePath + '-shm',
            this.databasePath + '-wal'
        ];

        for (let filePath of databaseFiles) {
            if (existsSync(filePath)) {
                unlinkSync(filePath);
            }
        }
    }

    private createSchema(): void {
        this.database.exec('PRAGMA journal_mode = WAL');
        this.database.exec('PRAGMA synchronous = NORMAL');

        this.database.exec('CREATE TABLE gloss_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, position INTEGER NOT NULL DEFAULT 0)');
        this.database.exec('CREATE TABLE gloss_entry_attributes (entry_id INTEGER NOT NULL, position INTEGER NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(entry_id, name), FOREIGN KEY(entry_id) REFERENCES gloss_entries(id) ON DELETE CASCADE)');
        this.database.exec('CREATE TABLE gloss_entry_comments (entry_id INTEGER PRIMARY KEY, text TEXT NOT NULL, FOREIGN KEY(entry_id) REFERENCES gloss_entries(id) ON DELETE CASCADE)');
        this.database.exec('CREATE TABLE gloss_entry_comment_attributes (entry_id INTEGER NOT NULL, position INTEGER NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(entry_id, name), FOREIGN KEY(entry_id) REFERENCES gloss_entry_comments(entry_id) ON DELETE CASCADE)');
        this.database.exec('CREATE TABLE gloss_lang_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id INTEGER NOT NULL, lang TEXT NOT NULL, position INTEGER NOT NULL, FOREIGN KEY(entry_id) REFERENCES gloss_entries(id) ON DELETE CASCADE)');
        this.database.exec('CREATE TABLE gloss_lang_entry_attributes (lang_entry_id INTEGER NOT NULL, position INTEGER NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(lang_entry_id, name), FOREIGN KEY(lang_entry_id) REFERENCES gloss_lang_entries(id) ON DELETE CASCADE)');
        this.database.exec('CREATE TABLE gloss_terms (lang_entry_id INTEGER PRIMARY KEY, text TEXT NOT NULL, FOREIGN KEY(lang_entry_id) REFERENCES gloss_lang_entries(id) ON DELETE CASCADE)');
        this.database.exec('CREATE TABLE gloss_term_attributes (lang_entry_id INTEGER NOT NULL, position INTEGER NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(lang_entry_id, name), FOREIGN KEY(lang_entry_id) REFERENCES gloss_lang_entries(id) ON DELETE CASCADE)');
        this.database.exec('CREATE TABLE gloss_definitions (lang_entry_id INTEGER PRIMARY KEY, text TEXT NOT NULL, source TEXT NOT NULL DEFAULT \'\', FOREIGN KEY(lang_entry_id) REFERENCES gloss_lang_entries(id) ON DELETE CASCADE)');
        this.database.exec('CREATE TABLE gloss_definition_attributes (lang_entry_id INTEGER NOT NULL, position INTEGER NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(lang_entry_id, name), FOREIGN KEY(lang_entry_id) REFERENCES gloss_lang_entries(id) ON DELETE CASCADE)');
        this.database.exec('CREATE TABLE gloss_columns (position INTEGER PRIMARY KEY, type TEXT NOT NULL, lang TEXT, UNIQUE(type, lang))');
        this.database.exec('CREATE INDEX idx_gloss_entries_position ON gloss_entries(position)');
        this.database.exec('CREATE INDEX idx_gloss_lang_entries_lang ON gloss_lang_entries(lang, entry_id, position)');
        this.database.exec('CREATE INDEX idx_gloss_lang_entries_entry ON gloss_lang_entries(entry_id, position)');
        this.database.exec('CREATE INDEX idx_gloss_terms_lang_entry ON gloss_terms(lang_entry_id)');
        this.database.exec('CREATE INDEX idx_gloss_columns_position ON gloss_columns(position)');
    }

    private loadEntryRow(id: number): GlossaryEntry {
        let attributes: XMLAttribute[] = this.loadAttributes('gloss_entry_attributes', 'entry_id', id);
        let comment: GlossaryComment | null = null;
        let commentRow: Record<string, unknown> | undefined = this.database.prepare('SELECT text FROM gloss_entry_comments WHERE entry_id = ?').get(id);
        if (commentRow) {
            comment = new GlossaryComment(String(commentRow['text']), this.loadAttributes('gloss_entry_comment_attributes', 'entry_id', id));
        }

        let langEntries: GlossaryLangEntry[] = [];
        let langRows: Record<string, unknown>[] = this.database.prepare('SELECT id, lang FROM gloss_lang_entries WHERE entry_id = ? ORDER BY position').all(id);
        for (let langRow of langRows) {
            let langEntryId: number = Number(langRow['id']);
            let lang: string = String(langRow['lang']);
            let termRow: Record<string, unknown> | undefined = this.database.prepare('SELECT text FROM gloss_terms WHERE lang_entry_id = ?').get(langEntryId);
            let definitionRow: Record<string, unknown> | undefined = this.database.prepare('SELECT text, source FROM gloss_definitions WHERE lang_entry_id = ?').get(langEntryId);
            let term = new GlossaryTerm(termRow ? String(termRow['text']) : '', this.loadAttributes('gloss_term_attributes', 'lang_entry_id', langEntryId));
            let definition: GlossaryDefinition | null = null;

            if (definitionRow) {
                definition = new GlossaryDefinition(
                    String(definitionRow['text']),
                    String(definitionRow['source']),
                    this.loadAttributes('gloss_definition_attributes', 'lang_entry_id', langEntryId)
                );
            }

            let langAttributes: XMLAttribute[] = [new XMLAttribute('xml:lang', lang)];
            let storedLangAttributes: XMLAttribute[] = this.loadAttributes('gloss_lang_entry_attributes', 'lang_entry_id', langEntryId);
            for (let attribute of storedLangAttributes) {
                langAttributes.push(attribute);
            }

            langEntries.push(new GlossaryLangEntry(langEntryId, lang, term, definition, langAttributes));
        }

        return new GlossaryEntry(id, comment, langEntries, attributes);
    }

    private loadAttributes(table: string, keyColumn: string, keyValue: number): XMLAttribute[] {
        let rows: Record<string, unknown>[] = this.database.prepare('SELECT name, value FROM ' + table + ' WHERE ' + keyColumn + ' = ? ORDER BY position').all(keyValue);
        let attributes: XMLAttribute[] = [];
        for (let row of rows) {
            attributes.push(new XMLAttribute(String(row['name']), String(row['value'])));
        }
        return attributes;
    }

    private insertAttributes(table: string, keyColumn: string, keyValue: number, attributes: XMLAttribute[]): void {
        if (attributes.length === 0) {
            return;
        }

        let statement = this.database.prepare('INSERT INTO ' + table + ' (' + keyColumn + ', position, name, value) VALUES (?, ?, ?, ?)');

        for (let i = 0; i < attributes.length; i++) {
            let attribute: XMLAttribute = attributes[i];
            statement.run(keyValue, i, attribute.getName(), attribute.getValue());
        }
    }

    private filterAttributes(attributes: XMLAttribute[], excludedName: string): XMLAttribute[] {
        let filtered: XMLAttribute[] = [];
        for (let attribute of attributes) {
            if (attribute.getName() !== excludedName) {
                filtered.push(attribute);
            }
        }
        return filtered;
    }

    private normalizeColumn(column: Column): Column {
        return this.createColumn(column.type, column.lang);
    }

    private createColumn(type: ColumnTypes, lang: string | undefined): Column {
        if (type === ColumnTypes.COMMENT) {
            return new Column(type, undefined, this.i18n.getString('column', 'comment'));
        }

        let safeLang: string = lang || '';
        let langDescription: string = LanguageUtils.getTagDescription(safeLang);
        if (type === ColumnTypes.TERM) {
            return new Column(type, safeLang, this.i18n.format(this.i18n.getString('column', 'term'), [langDescription]));
        }
        return new Column(type, safeLang, this.i18n.format(this.i18n.getString('column', 'definition'), [langDescription]));
    }

    private persistColumns(): void {
        this.database.exec('DELETE FROM gloss_columns');
        let statement = this.database.prepare('INSERT INTO gloss_columns (position, type, lang) VALUES (?, ?, ?)');
        for (let i = 0; i < this.columns.length; i++) {
            let column: Column = this.columns[i];
            statement.run(i, column.type, column.lang || null);
        }
    }

    private loadColumnsFromDatabase(): void {
        let rows: Record<string, unknown>[] = this.database.prepare('SELECT type, lang FROM gloss_columns').all();
        let columns: Column[] = [];
        for (let row of rows) {
            let type = String(row['type']) as ColumnTypes;
            let lang = row['lang'] === null || row['lang'] === undefined ? undefined : String(row['lang']);
            columns.push(this.createColumn(type, lang));
        }
        this.columns = this.sortColumns(columns);
    }

    private compactColumnPositions(): void {
        let rows: Record<string, unknown>[] = this.database.prepare('SELECT rowid, type, lang FROM gloss_columns ORDER BY position').all();
        let update = this.database.prepare('UPDATE gloss_columns SET position = ? WHERE rowid = ?');
        for (let i = 0; i < rows.length; i++) {
            let rowId: number = Number(rows[i]['rowid']);
            update.run(i, rowId);
        }
    }

    private getNextColumnPosition(): number {
        let row: Record<string, unknown> | undefined = this.database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM gloss_columns').get();
        return Number(row ? row['next_position'] : 0);
    }

    private updateCommentCell(entryId: number, value: string): void {
        this.saved = false;
        if (value === '') {
            this.database.prepare('DELETE FROM gloss_entry_comment_attributes WHERE entry_id = ?').run(entryId);
            this.database.prepare('DELETE FROM gloss_entry_comments WHERE entry_id = ?').run(entryId);
            return;
        }

        let existing: Record<string, unknown> | undefined = this.database.prepare('SELECT entry_id FROM gloss_entry_comments WHERE entry_id = ?').get(entryId);
        if (existing) {
            this.database.prepare('UPDATE gloss_entry_comments SET text = ? WHERE entry_id = ?').run(value, entryId);
        } else {
            this.database.prepare('INSERT INTO gloss_entry_comments (entry_id, text) VALUES (?, ?)').run(entryId, value);
        }
    }

    private updateTermCell(langEntryId: number | null, entryId: number, lang: string, value: string): void {
        this.saved = false;
        if (value === '') {
            if (langEntryId === null) {
                return;
            }
            this.database.prepare('DELETE FROM gloss_term_attributes WHERE lang_entry_id = ?').run(langEntryId);
            this.database.prepare('DELETE FROM gloss_terms WHERE lang_entry_id = ?').run(langEntryId);
            this.removeEmptyLangEntry(langEntryId);
            return;
        }

        if (langEntryId === null) {
            langEntryId = this.createLangEntry(entryId, lang);
        }
        let existing: Record<string, unknown> | undefined = this.database.prepare('SELECT lang_entry_id FROM gloss_terms WHERE lang_entry_id = ?').get(langEntryId);
        if (existing) {
            this.database.prepare('UPDATE gloss_terms SET text = ? WHERE lang_entry_id = ?').run(value, langEntryId);
        } else {
            this.database.prepare('INSERT INTO gloss_terms (lang_entry_id, text) VALUES (?, ?)').run(langEntryId, value);
        }
    }

    private updateDefinitionCell(langEntryId: number | null, entryId: number, lang: string, value: string): void {
        if (value === '') {
            if (langEntryId === null) {
                return;
            }
            this.database.prepare('DELETE FROM gloss_definition_attributes WHERE lang_entry_id = ?').run(langEntryId);
            this.database.prepare('DELETE FROM gloss_definitions WHERE lang_entry_id = ?').run(langEntryId);
            this.removeEmptyLangEntry(langEntryId);
            return;
        }

        if (langEntryId === null) {
            langEntryId = this.createLangEntry(entryId, lang);
        }
        let existing: Record<string, unknown> | undefined = this.database.prepare('SELECT lang_entry_id FROM gloss_definitions WHERE lang_entry_id = ?').get(langEntryId);
        if (existing) {
            this.database.prepare('UPDATE gloss_definitions SET text = ? WHERE lang_entry_id = ?').run(value, langEntryId);
        } else {
            this.database.prepare('INSERT INTO gloss_definitions (lang_entry_id, text, source) VALUES (?, ?, ?)').run(langEntryId, value, '');
        }
    }

    private createLangEntry(entryId: number, lang: string): number {
        let positionRow: Record<string, unknown> | undefined = this.database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM gloss_lang_entries WHERE entry_id = ?').get(entryId);
        let position: number = Number(positionRow ? positionRow['next_position'] : 0);
        let result = this.database.prepare('INSERT INTO gloss_lang_entries (entry_id, lang, position) VALUES (?, ?, ?)').run(entryId, lang, position);
        this.saved = false;
        return Number(result.lastInsertRowid);
    }

    private resolveLangEntryId(entryId: number, lang: string): number | null {
        let row: Record<string, unknown> | undefined = this.database.prepare('SELECT id FROM gloss_lang_entries WHERE entry_id = ? AND lang = ? ORDER BY position LIMIT 1').get(entryId, lang);
        if (!row) {
            return null;
        }
        return Number(row['id']);
    }

    private loadBulkRowValues(entryIds: number[]): { id: number, values: string[] }[] {
        if (entryIds.length === 0) {
            return [];
        }
        let placeholders: string = entryIds.map(() => '?').join(',');
        let commentRows: Record<string, unknown>[] = this.database.prepare(
            'SELECT entry_id, text FROM gloss_entry_comments WHERE entry_id IN (' + placeholders + ')'
        ).all(...entryIds as [number, ...number[]]);
        let commentMap: Map<number, string> = new Map();
        for (let cr of commentRows) {
            commentMap.set(Number(cr['entry_id']), String(cr['text']));
        }
        let termDefRows: Record<string, unknown>[] = this.database.prepare(
            'SELECT le.entry_id, le.lang, t.text AS term, d.text AS definition '
            + 'FROM gloss_lang_entries le '
            + 'LEFT JOIN gloss_terms t ON t.lang_entry_id = le.id '
            + 'LEFT JOIN gloss_definitions d ON d.lang_entry_id = le.id '
            + 'WHERE le.entry_id IN (' + placeholders + ') '
            + 'ORDER BY le.entry_id, le.position'
        ).all(...entryIds as [number, ...number[]]);
        let dataMap: Map<number, Map<string, { term: string, definition: string }>> = new Map();
        for (let entryId of entryIds) {
            dataMap.set(entryId, new Map());
        }
        for (let row of termDefRows) {
            let eid: number = Number(row['entry_id']);
            let lang: string = String(row['lang']);
            let langMap: Map<string, { term: string, definition: string }> | undefined = dataMap.get(eid);
            if (langMap) {
                langMap.set(lang, {
                    term: row['term'] ? String(row['term']) : '',
                    definition: row['definition'] ? String(row['definition']) : ''
                });
            }
        }
        let result: { id: number, values: string[] }[] = [];
        for (let entryId of entryIds) {
            let values: string[] = [];
            let langMap: Map<string, { term: string, definition: string }> | undefined = dataMap.get(entryId);
            for (let column of this.columns) {
                if (column.type === ColumnTypes.COMMENT) {
                    values.push(commentMap.get(entryId) || '');
                } else if (column.type === ColumnTypes.TERM && column.lang) {
                    let data = langMap ? langMap.get(column.lang) : undefined;
                    values.push(data ? data.term : '');
                } else if (column.type === ColumnTypes.DEFINITION && column.lang) {
                    let data = langMap ? langMap.get(column.lang) : undefined;
                    values.push(data ? data.definition : '');
                }
            }
            result.push({ id: entryId, values: values });
        }
        return result;
    }

    private removeEmptyLangEntry(langEntryId: number): void {
        this.saved = false;
        let termRow: Record<string, unknown> | undefined = this.database.prepare('SELECT lang_entry_id FROM gloss_terms WHERE lang_entry_id = ?').get(langEntryId);
        let definitionRow: Record<string, unknown> | undefined = this.database.prepare('SELECT lang_entry_id FROM gloss_definitions WHERE lang_entry_id = ?').get(langEntryId);
        if (termRow || definitionRow) {
            return;
        }
        let parentRow: Record<string, unknown> | undefined = this.database.prepare('SELECT entry_id FROM gloss_lang_entries WHERE id = ?').get(langEntryId);
        this.database.prepare('DELETE FROM gloss_lang_entries WHERE id = ?').run(langEntryId);
        if (parentRow) {
            let entryId: number = Number(parentRow['entry_id']);
            let remaining: Record<string, unknown> | undefined = this.database.prepare('SELECT COUNT(*) AS total FROM gloss_lang_entries WHERE entry_id = ?').get(entryId);
            if (remaining && Number(remaining['total']) === 0) {
                this.database.prepare('DELETE FROM gloss_entries WHERE id = ?').run(entryId);
            }
        }
    }

    getLanguages(): string[] {
        let rows: Record<string, unknown>[] = this.database.prepare('SELECT DISTINCT lang FROM gloss_lang_entries ORDER BY lang').all();
        let languages: string[] = [];
        for (let row of rows) {
            languages.push(String(row['lang']));
        }
        return languages;
    }

    renameLanguage(oldLanguage: string, newLanguage: string): void {
        this.database.exec('BEGIN');
        try {
            this.database.prepare('UPDATE gloss_lang_entries SET lang = ? WHERE lang = ?').run(newLanguage, oldLanguage);
            this.database.prepare('UPDATE gloss_columns SET lang = ? WHERE lang = ?').run(newLanguage, oldLanguage);
            this.database.exec('COMMIT');
        } catch (error) {
            if (this.database.isTransaction) {
                this.database.exec('ROLLBACK');
            }
            throw error;
        }
        if (this.sourceLanguage === oldLanguage) {
            this.sourceLanguage = newLanguage;
        }
        this.loadColumnsFromDatabase();
        this.saved = false;
    }

    exportTMX(filePath: string, version: string): void {
        let declaration: XMLDeclaration = new XMLDeclaration('1.0', 'utf-8');
        writeFileSync(filePath, declaration.toString() + '\n', 'utf-8');
        let documentType: XMLDocumentType = new XMLDocumentType('tmx', '-//LISA OSCAR:1998//DTD for Translation Memory eXchange//EN', 'tmx14.dtd');
        appendFileSync(filePath, documentType.toString() + '\n', 'utf-8');

        let tmxElement: XMLElement = new XMLElement('tmx');
        tmxElement.setAttribute(new XMLAttribute('version', '1.4'));
        appendFileSync(filePath, tmxElement.getHead() + '\n', 'utf-8');

        let headerElement: XMLElement = new XMLElement('header');
        headerElement.setAttribute(new XMLAttribute('creationtool', 'Anchovy'));
        headerElement.setAttribute(new XMLAttribute('creationtoolversion', version));
        headerElement.setAttribute(new XMLAttribute('srclang', this.sourceLanguage));
        headerElement.setAttribute(new XMLAttribute('datatype', 'xml'));
        headerElement.setAttribute(new XMLAttribute('adminlang', 'en'));
        headerElement.setAttribute(new XMLAttribute('segtype', 'phrase'));
        headerElement.setAttribute(new XMLAttribute('o-tmf', 'block'));
        headerElement.setAttribute(new XMLAttribute('creationdate', new Date().toISOString().replaceAll(/[-:]/g, '').replaceAll(/\.\d{3}/g, '')));

        if (this.rootComment) {
            headerElement.addString('\n  ');
            let noteElement: XMLElement = new XMLElement('note');
            noteElement.addString(this.rootComment.getText());
            headerElement.addElement(noteElement);
            headerElement.addString('\n');
        }

        appendFileSync(filePath, headerElement.toString() + '\n', 'utf-8');

        let bodyElement: XMLElement = new XMLElement('body');
        appendFileSync(filePath, bodyElement.getHead() + '\n', 'utf-8');

        let indenter: Indenter = new Indenter(2, 2);
        let batchSize: number = 1000;
        let entryCount: number = this.getEntryCount();
        let offset: number = 0;

        while (offset < entryCount) {
            let entryRows: GlossaryEntry[] = this.getRows(batchSize, offset, null, undefined, true);
            for (let row of entryRows) {
                if (row.langEntries.length === 0) {
                    continue;
                }
                let element: XMLElement = this.toTu(row.toElement());
                indenter.indent(element);
                appendFileSync(filePath, '  ' + element.toString() + '\n', 'utf-8');
            }
            offset = offset + entryRows.length;
        }

        appendFileSync(filePath, bodyElement.getTail() + '\n', 'utf-8');
        appendFileSync(filePath, tmxElement.getTail(), 'utf-8');
    }

    toTu(glossentry: XMLElement): XMLElement {
        let tuElement: XMLElement = new XMLElement('tu');
        let comment = glossentry.getChild('comment');
        if (comment) {
            let noteElement: XMLElement = new XMLElement('note');
            noteElement.addString(comment.getText());
            tuElement.addElement(noteElement);
        }
        let langEntries: XMLElement[] = glossentry.getChildren().filter((child: XMLElement) => child.getName() === 'langentry');
        for (let langEntry of langEntries) {
            let tuvElement: XMLElement = new XMLElement('tuv');
            let langAttribute: XMLAttribute | null = langEntry.getAttribute('xml:lang');
            if (!langAttribute) {
                continue;
            }
            tuvElement.setAttribute(langAttribute);
            let definitionElement: XMLElement | null = langEntry.getChild('definition');
            if (definitionElement) {
                let propElement: XMLElement = new XMLElement('prop');
                propElement.setAttribute(new XMLAttribute('type', 'definition'));
                propElement.addString(definitionElement.getText());
                tuvElement.addElement(propElement);
            }
            let termElement: XMLElement | null = langEntry.getChild('term');
            if (termElement) {
                let segElement: XMLElement = new XMLElement('seg');
                segElement.addString(termElement.getText());
                tuvElement.addElement(segElement);
            }
            if (tuvElement.getChildren().length === 0) {
                continue;
            }
            tuElement.addElement(tuvElement);
        }
        return tuElement;
    }

    exportTBX(filePath: string, version: string): void {
        let declaration: XMLDeclaration = new XMLDeclaration('1.0', 'utf-8');
        writeFileSync(filePath, declaration.toString() + '\n', 'utf-8');

        let tbxElement: XMLElement = new XMLElement('tbx');
        tbxElement.setAttribute(new XMLAttribute('type', 'TBX-Basic'));
        tbxElement.setAttribute(new XMLAttribute('style', 'dca'));
        tbxElement.setAttribute(new XMLAttribute('xml:lang', this.sourceLanguage));
        tbxElement.setAttribute(new XMLAttribute('xmlns', 'urn:iso:std:iso:30042:ed-2'));
        appendFileSync(filePath, tbxElement.getHead() + '\n', 'utf-8');

        let tbxHeaderElement: XMLElement = new XMLElement('tbxHeader');
        let fileDescElement: XMLElement = new XMLElement('fileDesc');
        let sourceDescElement: XMLElement = new XMLElement('sourceDesc');
        let pElement: XMLElement = new XMLElement('p');
        pElement.addString(this.rootComment ? this.rootComment.getText() : this.i18n.format(this.i18n.getString('GlossaryModel', 'generatedBy'), [version]));
        sourceDescElement.addElement(pElement);
        fileDescElement.addElement(sourceDescElement);
        tbxHeaderElement.addElement(fileDescElement);
        new Indenter(2, 1).indent(tbxHeaderElement);
        appendFileSync(filePath, tbxHeaderElement.toString() + '\n', 'utf-8');

        let textElement: XMLElement = new XMLElement('text');
        appendFileSync(filePath, textElement.getHead() + '\n', 'utf-8');
        let bodyElement: XMLElement = new XMLElement('body');
        appendFileSync(filePath, bodyElement.getHead() + '\n', 'utf-8');

        let indenter: Indenter = new Indenter(2, 2);
        let batchSize: number = 1000;
        let entryCount: number = this.getEntryCount();
        let offset: number = 0;

        while (offset < entryCount) {
            let entryRows: GlossaryEntry[] = this.getRows(batchSize, offset, null, undefined, true);
            for (let row of entryRows) {
                if (row.langEntries.length === 0) {
                    continue;
                }
                let element: XMLElement = this.toConceptEntry(row.toElement(), row.id);
                indenter.indent(element);
                appendFileSync(filePath, '  ' + element.toString() + '\n', 'utf-8');
            }
            offset = offset + entryRows.length;
        }

        appendFileSync(filePath, bodyElement.getTail() + '\n', 'utf-8');
        appendFileSync(filePath, textElement.getTail() + '\n', 'utf-8');
        appendFileSync(filePath, tbxElement.getTail(), 'utf-8');
    }

    toConceptEntry(glossentry: XMLElement, id: number): XMLElement {
        let conceptEntryElement: XMLElement = new XMLElement('conceptEntry');
        conceptEntryElement.setAttribute(new XMLAttribute('id', 'c' + id));
        let comment = glossentry.getChild('comment');
        if (comment) {
            let noteElement: XMLElement = new XMLElement('note');
            noteElement.addString(comment.getText());
            conceptEntryElement.addElement(noteElement);
        }
        let langEntries: XMLElement[] = glossentry.getChildren().filter((child: XMLElement) => child.getName() === 'langentry');
        let langSecs: Map<string, XMLElement> = new Map();
        for (let langEntry of langEntries) {
            let langAttribute: XMLAttribute | null = langEntry.getAttribute('xml:lang');
            if (!langAttribute) {
                continue;
            }
            let termElement: XMLElement | null = langEntry.getChild('term');
            if (!termElement) {
                continue;
            }
            let termSecElement: XMLElement = new XMLElement('termSec');
            let termElementCopy: XMLElement = new XMLElement('term');
            termElementCopy.addString(termElement.getText());
            termSecElement.addElement(termElementCopy);
            let definitionElement: XMLElement | null = langEntry.getChild('definition');
            if (definitionElement) {
                let descripElement: XMLElement = new XMLElement('descrip');
                descripElement.setAttribute(new XMLAttribute('type', 'definition'));
                descripElement.addString(definitionElement.getText());
                termSecElement.addElement(descripElement);
            }
            let lang: string = langAttribute.getValue();
            let langSecElement: XMLElement | undefined = langSecs.get(lang);
            if (!langSecElement) {
                langSecElement = new XMLElement('langSec');
                langSecElement.setAttribute(new XMLAttribute('xml:lang', lang));
                langSecs.set(lang, langSecElement);
                conceptEntryElement.addElement(langSecElement);
            }
            langSecElement.addElement(termSecElement);
        }
        return conceptEntryElement;
    }
}