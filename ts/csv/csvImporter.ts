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

import { ExcelColumnMapping } from '../model/excelImporter.js';
import { GlossaryComment } from '../model/glossaryComment.js';
import { GlossaryDefinition } from '../model/glossaryDefinition.js';
import { GlossaryEntry } from '../model/glossaryEntry.js';
import { GlossaryLangEntry } from '../model/glossaryLangEntry.js';
import { GlossaryTerm } from '../model/glossaryTerm.js';
import { GlossMLWriter } from '../model/glossMLWriter.js';
import { CsvEncoding, CsvReader } from './csvReader.js';

export class CsvImporter {

    convert(csvFile: string, glossmlFile: string, encoding: CsvEncoding, columnSeparator: string, textDelimiter: string,
        hasHeaderRow: boolean, sourceLanguage: string, columns: ExcelColumnMapping[]): void {
        let rows: string[][] = new CsvReader().readRows(csvFile, encoding, columnSeparator, textDelimiter);
        let dataRows: string[][] = hasHeaderRow ? rows.slice(1) : rows;

        let entries: GlossaryEntry[] = this.buildEntries(dataRows, columns);
        new GlossMLWriter().writeFile(glossmlFile, sourceLanguage, entries);
    }

    private buildEntries(dataRows: string[][], columns: ExcelColumnMapping[]): GlossaryEntry[] {
        let entries: GlossaryEntry[] = [];
        let id: number = 0;
        for (let row of dataRows) {
            let comment: GlossaryComment | null = null;
            let langValues: Map<string, { term: string, definition: string }> = new Map();

            for (let c = 0; c < columns.length; c++) {
                let mapping: ExcelColumnMapping = columns[c];
                let value: string = (row[c] ?? '').trim();
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
}
