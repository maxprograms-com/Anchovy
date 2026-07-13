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

import { writeFileSync } from "node:fs";
import { Catalog, ContentHandler, Grammar, Indenter, TextNode, XMLAttribute, XMLDeclaration, XMLElement, XMLNode } from "typesxml";

export class TMXHandler implements ContentHandler {

    glsFile: string;
    catalog: Catalog | undefined;
    inCData: boolean = false;
    inTu: boolean = false;
    currentTu: XMLElement | undefined;
    currentElement: XMLElement | undefined;
    grammar: Grammar | undefined;
    stack: Array<XMLElement>;
    indenter: Indenter;

    constructor(glossMLFile: string) {
        this.glsFile = glossMLFile;
        this.currentTu = undefined;
        this.inCData = false;
        this.inTu = false;
        this.stack = [];
        this.indenter = new Indenter(2, 1);
    }

    initialize(): void {
        this.currentTu = undefined;
        this.inCData = false;
        this.inTu = false;
        this.currentElement = undefined;
    }

    setCatalog(catalog: Catalog): void {
        this.catalog = catalog;
    }

    startDocument(): void {
        // do nothing
    }

    endDocument(): void {
        // do nothing
    }

    xmlDeclaration(version: string, encoding: string, standalone: string | undefined): void {
        // do nothing
    }

    startElement(name: string, atts: Array<XMLAttribute>): void {
        let element: XMLElement = new XMLElement(name);
        element.setAttributes(atts);
        if (name === 'header') {
            // write glossary header
            const xmlDecl: XMLDeclaration = new XMLDeclaration('1.0', 'UTF-8');
            writeFileSync(this.glsFile, xmlDecl.toString());
            let glossary: XMLElement = new XMLElement('glossary');
            glossary.setAttribute(new XMLAttribute('version', '1.0'));
            let srcLang: string = element.getAttribute('srclang')?.getValue() || '*all*';
            glossary.setAttribute(new XMLAttribute('srclang', srcLang));
            glossary.setAttribute(new XMLAttribute('xmlns', 'http://maxprograms.com/gml'));
            glossary.setAttribute(new XMLAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance'));
            writeFileSync(this.glsFile, '\n' + glossary.getHead(), { flag: 'a' });
        }
        if (name === 'tu') {
            // create glossary entry
            this.stack = [];
            this.currentTu = element;
            this.inTu = true;
        } else if (this.inTu) {
            // add element to its parent
            this.stack[this.stack.length - 1].addElement(element);
        }
        if (this.inTu) {
            this.stack.push(element);
        }
        this.currentElement = element;
    }

    endElement(name: string): void {
        if (this.inTu) {
            this.stack.pop();
        }
        if (name === 'tu') {
            // TODO write glossary entry
            this.writeGlossaryEntry();
            this.inTu = false;
        }
        if (name === 'tmx') {
            writeFileSync(this.glsFile, '\n</glossary>', { flag: 'a' });
        }
    }

    writeGlossaryEntry(): void {
        let notes: XMLElement[] = this.currentTu.getChildren().filter(child => child.getName() === 'note');
        let notesText: string = '';
        for (let note of notes) {
            if (notesText !== '') {
                notesText += '\n';
            }
            notesText += note.getText();
        }
        let glossentry: XMLElement = new XMLElement('glossentry');
        if (notesText !== '') {
            let comment: XMLElement = new XMLElement('comment');
            comment.addString(notesText);
            glossentry.addElement(comment);
        }
        let tuvs: XMLElement[] = this.currentTu.getChildren().filter(child => child.getName() === 'tuv');
        if (tuvs.length === 0) {
            return;
        }
        for (let tuv of tuvs) {
            let lang: XMLAttribute | undefined = tuv.getAttribute('xml:lang');
            if (!lang) {
                lang = tuv.getAttribute('lang');
                if (lang) {
                    lang = new XMLAttribute('xml:lang', lang.getValue());
                }
            }
            if (!lang) {
                continue;
            }
            let seg: XMLElement = tuv.getChild('seg');
            if (!seg) {
                continue;
            }
            let langEntry: XMLElement = new XMLElement('langentry');
            langEntry.setAttribute(lang);
            let term = new XMLElement('term');
            term.addString(this.pureText(seg));
            langEntry.addElement(term);
            let props: XMLElement[] = tuv.getChildren().filter(child => child.getName() === 'prop');
            let definitionText: string = '';
            for (let prop of props) {
                let type = prop.getAttribute('type');
                if (!type) {
                    continue;
                }
                if ('definition' === type.getValue()) {
                    if (definitionText !== '') {
                        definitionText += '\n';
                    }
                    definitionText += prop.getText();
                }
            }
            if (definitionText !== '') {
                let definition: XMLElement = new XMLElement('definition');
                definition.addString(definitionText);
                langEntry.addElement(definition);
            }
            glossentry.addElement(langEntry);
        }
        this.indenter.indent(glossentry);
        writeFileSync(this.glsFile, '\n' + glossentry.toString(), { flag: 'a' });
    }

    pureText(element: XMLElement): string {
        let text: string = '';
        let content: XMLNode[] = element.getContent();
        for (let node of content) {
            if (node instanceof TextNode) {
                text += node.getValue();;
            }
            if (node instanceof XMLElement) {
                // ignore <sub> on purpose
                let child: XMLElement = node as XMLElement;
                if ('hi' === child.getName()) {
                    text += child.getText();
                }
            }
        }
        return text;
    }

    internalSubset(declaration: string): void {
        // do nothing
    }

    characters(ch: string): void {
        if (this.inTu && this.stack.length > 0) {
            this.stack[this.stack.length - 1].addString(ch);
        }
    }

    ignorableWhitespace(ch: string): void {
        if (this.inTu && this.stack.length > 0) {
            this.stack[this.stack.length - 1].addString(ch);
        }
    }

    comment(ch: string): void {
        // do nothing
    }

    processingInstruction(target: string, data: string): void {
        // do nothing
    }

    startCDATA(): void {
        this.inCData = true;
    }

    endCDATA(): void {
        this.inCData = false;
    }

    startDTD(name: string, publicId: string, systemId: string): void {
        // do nothing
    }

    endDTD(): void {
        // do nothing
    }

    skippedEntity(name: string): void {
        // do nothing
    }

    getGrammar(): Grammar | undefined {
        return undefined;
    }

    setGrammar(grammar: Grammar | undefined): void {
        // do nothing
    }

    getCurrentText(): string {
        return this.currentElement ? this.currentElement.getText() : '';
    }

}