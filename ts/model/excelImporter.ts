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

import { CellValue, ExcelReader, ExcelSheetData } from 'typesexcel';
import { GlossaryComment } from './glossaryComment.js';
import { GlossaryDefinition } from './glossaryDefinition.js';
import { GlossaryEntry } from './glossaryEntry.js';
import { GlossaryLangEntry } from './glossaryLangEntry.js';
import { GlossaryTerm } from './glossaryTerm.js';
import { GlossMLWriter } from './glossMLWriter.js';

export type ColumnAction = 'skip' | 'comment' | 'term' | 'definition';

export interface ExcelColumnMapping {
    action: ColumnAction;
    lang?: string;
}

export class ExcelImporter {
    private language: string;

    constructor(language: string) {
        this.language = language;
    }

    convert(excelFile: string, glossmlFile: string, sheetIndex: number, hasHeaderRow: boolean, sourceLanguage: string, columns: ExcelColumnMapping[]): void {
        let sheets: ExcelSheetData[] = new ExcelReader(this.language).readSheets(excelFile);
        let rows: CellValue[][] = sheets[sheetIndex].rows;
        let dataRows: CellValue[][] = hasHeaderRow ? rows.slice(1) : rows;

        let entries: GlossaryEntry[] = this.buildEntries(dataRows, columns);
        new GlossMLWriter().writeFile(glossmlFile, sourceLanguage, entries);
    }

    private buildEntries(dataRows: CellValue[][], columns: ExcelColumnMapping[]): GlossaryEntry[] {
        let entries: GlossaryEntry[] = [];
        let id: number = 0;
        for (let row of dataRows) {
            let comment: GlossaryComment | null = null;
            let langValues: Map<string, { term: string, definition: string }> = new Map();

            for (let c = 0; c < columns.length; c++) {
                let mapping: ExcelColumnMapping = columns[c];
                let value: string = this.cellToString(row[c]).trim();
                if (!value) {
                    continue;
                }
                if (mapping.action === 'comment') {
                    comment = new GlossaryComment(value);
                } else if (mapping.action === 'term' && mapping.lang) {
                    let entry = langValues.get(mapping.lang) || { term: '', definition: '' };
                    entry.term = value;
                    langValues.set(mapping.lang, entry);
                } else if (mapping.action === 'definition' && mapping.lang) {
                    let entry = langValues.get(mapping.lang) || { term: '', definition: '' };
                    entry.definition = value;
                    langValues.set(mapping.lang, entry);
                }
            }

            if (langValues.size === 0) {
                continue;
            }

            let langEntries: GlossaryLangEntry[] = [];
            for (let [lang, values] of langValues) {
                let definition: GlossaryDefinition | null = values.definition ? new GlossaryDefinition(values.definition) : null;
                langEntries.push(new GlossaryLangEntry(0, lang, new GlossaryTerm(values.term), definition));
            }
            entries.push(new GlossaryEntry(id++, comment, langEntries));
        }
        return entries;
    }

    private cellToString(value: CellValue): string {
        if (value === null || value === undefined) {
            return '';
        }
        if (value instanceof Date) {
            return value.toLocaleDateString();
        }
        return '' + value;
    }
}
