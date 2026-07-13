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

export class GlossaryDefinition {
    text: string;
    source: string;
    attributes: XMLAttribute[];

    constructor(text: string, source: string = '', attributes: XMLAttribute[] = []) {
        this.text = text;
        this.source = source;
        this.attributes = attributes;
    }

    getText(): string {
        return this.text;
    }

    setText(text: string): void {
        this.text = text;
    }

    getSource(): string {
        return this.source;
    }

    setSource(source: string): void {
        this.source = source;
    }

    toElement(): XMLElement {
        let definitionElement: XMLElement = new XMLElement('definition');
        definitionElement.setAttributes(this.attributes);
        if (this.source) {
            definitionElement.setAttribute(new XMLAttribute('source', this.source));
        }
        definitionElement.addString(this.text);
        return definitionElement;
    }
}