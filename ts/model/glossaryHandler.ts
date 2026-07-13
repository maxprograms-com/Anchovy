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

import type { Catalog, ContentHandler, Grammar, TextNode, XMLNode } from 'typesxml';
import { Constants, XMLAttribute, XMLDeclaration, XMLElement } from 'typesxml';
import { GlossaryComment } from './glossaryComment.js';
import type { GlossaryModel } from './glossaryModel.js';
import { I18n } from '../i18n.js';

export class GlossaryHandler implements ContentHandler {
    private model: GlossaryModel;
    private entryStack: XMLElement[];
    private inCData: boolean;
    private i18n: I18n;

    constructor(model: GlossaryModel, messagesPath: string) {
        this.model = model;
        this.entryStack = [];
        this.inCData = false;
        this.i18n = new I18n(messagesPath);
    }

    initialize(): void {
        this.entryStack = [];
        this.inCData = false;
    }

    setCatalog(catalog: Catalog): void {
    }

    startDocument(): void {
    }

    endDocument(): void {
    }

    xmlDeclaration(version: string, encoding: string, standalone: string | undefined): void {
        this.model.setXmlDeclaration(new XMLDeclaration(version, encoding, standalone));
    }

    startElement(name: string, atts: XMLAttribute[]): void {
        if (this.entryStack.length === 0) {
            if (name !== 'glossary') {
                throw new Error(this.i18n.format(this.i18n.getString('GlossaryHandler', 'invalidRootElement'), [name]));
            }

            let glossaryElement: XMLElement = new XMLElement('glossary');
            glossaryElement.setAttributes(atts);
            if (!glossaryElement.hasAttribute('version')) {
                throw new Error(this.i18n.format(this.i18n.getString('GlossaryHandler', 'missingRootAttribute'), ['version']));
            }
            let versionAttribute: XMLAttribute | null = glossaryElement.getAttribute('version');
            if (!versionAttribute || versionAttribute.getValue() !== '1.0') {
                throw new Error(this.i18n.format(this.i18n.getString('GlossaryHandler', 'invalidGlossaryVersion'), [versionAttribute ? versionAttribute.getValue() : '']));
            }
            if (!glossaryElement.hasAttribute('srclang')) {
                throw new Error(this.i18n.format(this.i18n.getString('GlossaryHandler', 'missingRootAttribute'), ['srclang']));
            }
            this.model.setRootAttributes(glossaryElement.getAttributes());
            this.entryStack.push(glossaryElement);
            return;
        }

        let element: XMLElement = new XMLElement(name);
        element.setAttributes(atts);
        this.entryStack[this.entryStack.length - 1].addElement(element);
        this.entryStack.push(element);
    }

    endElement(name: string): void {
        let element: XMLElement | undefined = this.entryStack.pop();
        if (!element) {
            return;
        }
        if (element.getName() === 'glossary') {
            return;
        }
        if (this.entryStack.length === 1 && this.entryStack[0].getName() === 'glossary') {
            if (name === 'glossentry') {
                this.model.storeGlossEntry(element);
                return;
            }
            if (name === 'comment') {
                this.model.setRootComment(new GlossaryComment(
                    element.getText(),
                    element.getAttributes()
                ));
            }
        }
    }

    internalSubset(declaration: string): void {
    }

    characters(ch: string): void {
        if (this.inCData) {
            return;
        }

        if (this.entryStack.length > 0) {
            this.entryStack[this.entryStack.length - 1].addString(ch);
        }
    }

    ignorableWhitespace(ch: string): void {
    }

    comment(ch: string): void {
    }

    processingInstruction(target: string, data: string): void {
    }

    startCDATA(): void {
        this.inCData = true;
    }

    endCDATA(): void {
        this.inCData = false;
    }

    startDTD(name: string, publicId: string, systemId: string): void {
    }

    endDTD(): void {
    }

    skippedEntity(name: string): void {
    }

    getGrammar(): Grammar | undefined {
        return undefined;
    }

    setGrammar(grammar: Grammar | undefined): void {
    }

    getCurrentText(): string {
        if (this.entryStack.length === 0) {
            return '';
        }
        let currentElement: XMLElement = this.entryStack[this.entryStack.length - 1];
        let content: XMLNode[] = currentElement.getContent();
        let result: string = '';
        for (let node of content) {
            if (node.getNodeType() === Constants.TEXT_NODE) {
                result += (node as TextNode).getValue();
            }
        }
        return result;
    }
}