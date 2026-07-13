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
import { GlossaryDefinition } from './glossaryDefinition.js';
import { GlossaryTerm } from './glossaryTerm.js';

export class GlossaryLangEntry {
    id: number;
    lang: string;
    term: GlossaryTerm;
    definition: GlossaryDefinition | null;
    attributes: XMLAttribute[];

    constructor(id: number, lang: string, term: GlossaryTerm, definition: GlossaryDefinition | null = null, attributes: XMLAttribute[] = []) {
        this.id = id;
        this.lang = lang;
        this.term = term;
        this.definition = definition;
        this.attributes = attributes;
    }

    toElement(): XMLElement {
        let langEntryElement: XMLElement = new XMLElement('langentry');
        langEntryElement.setAttributes(this.attributes);
        if (!langEntryElement.hasAttribute('xml:lang')) {
            langEntryElement.setAttribute(new XMLAttribute('xml:lang', this.lang));
        }
        langEntryElement.addElement(this.term.toElement());
        if (this.definition) {
            langEntryElement.addElement(this.definition.toElement());
        }
        return langEntryElement;
    }
}