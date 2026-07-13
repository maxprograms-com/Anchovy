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

import { appendFileSync, writeFileSync } from 'node:fs';
import { Indenter, XMLAttribute, XMLDeclaration, XMLElement } from 'typesxml';
import { GlossaryEntry } from './glossaryEntry.js';

export class GlossMLWriter {

    writeFile(filePath: string, sourceLanguage: string, entries: GlossaryEntry[]): void {
        let declaration: XMLDeclaration = new XMLDeclaration('1.0', 'UTF-8');
        writeFileSync(filePath, declaration.toString() + '\n', 'utf8');

        let glossaryElement: XMLElement = new XMLElement('glossary');
        glossaryElement.setAttributes([
            new XMLAttribute('version', '1.0'),
            new XMLAttribute('srclang', sourceLanguage),
            new XMLAttribute('xmlns', 'http://maxprograms.com/gml'),
            new XMLAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance')
        ]);
        appendFileSync(filePath, glossaryElement.getHead() + '\n', 'utf8');

        let indenter: Indenter = new Indenter(2, 2);
        for (let entry of entries) {
            if (entry.langEntries.length === 0) {
                continue;
            }
            let element: XMLElement = entry.toElement();
            indenter.indent(element);
            appendFileSync(filePath, '  ' + element.toString() + '\n', 'utf8');
        }

        appendFileSync(filePath, '</glossary>\n', 'utf8');
    }
}
