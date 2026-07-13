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

export class GlossaryComment {
    text: string;
    attributes: XMLAttribute[];

    constructor(text: string, attributes: XMLAttribute[] = []) {
        this.text = text;
        this.attributes = attributes;
    }

    getText(): string {
        return this.text;
    }

    setText(text: string): void {
        this.text = text;
    }

    toElement(): XMLElement {
        let commentElement: XMLElement = new XMLElement('comment');
        commentElement.setAttributes(this.attributes);
        commentElement.addString(this.text);
        return commentElement;
    }
}