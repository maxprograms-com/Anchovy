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

import { XMLAttribute, XMLElement } from 'typesxml';
import { GlossaryComment } from './glossaryComment.js';
import { GlossaryLangEntry } from './glossaryLangEntry.js';

export class GlossaryEntry {
    id: number;
    comment: GlossaryComment | null;
    langEntries: GlossaryLangEntry[];
    attributes: XMLAttribute[];

    constructor(id: number, comment: GlossaryComment | null, langEntries: GlossaryLangEntry[], attributes: XMLAttribute[] = []) {
        this.id = id;
        this.comment = comment;
        this.langEntries = langEntries;
        this.attributes = attributes;
    }

    toElement(): XMLElement {
        let glossEntryElement: XMLElement = new XMLElement('glossentry');
        glossEntryElement.setAttributes(this.attributes);
        if (this.comment) {
            glossEntryElement.addElement(this.comment.toElement());
        }
        for (let langEntry of this.langEntries) {
            glossEntryElement.addElement(langEntry.toElement());
        }
        return glossEntryElement;
    }
}