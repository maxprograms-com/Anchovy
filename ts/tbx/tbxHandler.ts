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
import { Catalog, ContentHandler, Grammar, Indenter, XMLAttribute, XMLDeclaration, XMLElement } from "typesxml";

export class TBXHandler implements ContentHandler {

    glsFile: string;
    catalog: Catalog | undefined;
    inCData: boolean = false;
    inConceptEntry: boolean = false;
    inHeader: boolean = false;
    currentEntry: XMLElement | undefined;
    currentHeader: XMLElement | undefined;
    currentElement: XMLElement | undefined;
    grammar: Grammar | undefined;
    stack: Array<XMLElement>;
    headerStack: Array<XMLElement>;
    indenter: Indenter;

    constructor(glossMLFile: string) {
        this.glsFile = glossMLFile;
        this.currentEntry = undefined;
        this.currentHeader = undefined;
        this.inCData = false;
        this.inConceptEntry = false;
        this.inHeader = false;
        this.stack = [];
        this.headerStack = [];
        this.indenter = new Indenter(2, 1);
    }

    initialize(): void {
        this.currentEntry = undefined;
        this.currentHeader = undefined;
        this.inCData = false;
        this.inConceptEntry = false;
        this.inHeader = false;
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
        if (name === 'tbx' || name === 'martif') {
            const xmlDecl: XMLDeclaration = new XMLDeclaration('1.0', 'UTF-8');
            writeFileSync(this.glsFile, xmlDecl.toString());
            let glossary: XMLElement = new XMLElement('glossary');
            glossary.setAttribute(new XMLAttribute('version', '1.0'));
            let srcLang: string = element.getAttribute('xml:lang')?.getValue() || '*all*';
            glossary.setAttribute(new XMLAttribute('srclang', srcLang));
            glossary.setAttribute(new XMLAttribute('xmlns', 'http://maxprograms.com/gml'));
            glossary.setAttribute(new XMLAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance'));
            writeFileSync(this.glsFile, '\n' + glossary.getHead(), { flag: 'a' });
        }
        if (name === 'conceptEntry' || name === 'termEntry') {
            // create glossary entry
            this.stack = [];
            this.currentEntry = element;
            this.inConceptEntry = true;
        } else if (this.inConceptEntry) {
            // add element to its parent
            this.stack[this.stack.length - 1].addElement(element);
        }
        if (this.inConceptEntry) {
            this.stack.push(element);
        }
        if (name === 'tbxHeader' || name === 'martifHeader') {
            // collect header content to recover the glossary-level comment
            this.headerStack = [];
            this.currentHeader = element;
            this.inHeader = true;
        } else if (this.inHeader) {
            this.headerStack[this.headerStack.length - 1].addElement(element);
        }
        if (this.inHeader) {
            this.headerStack.push(element);
        }
        this.currentElement = element;
    }

    endElement(name: string): void {
        if (this.inConceptEntry) {
            this.stack.pop();
        }
        if (name === 'conceptEntry' || name === 'termEntry') {
            this.writeGlossaryEntry();
            this.inConceptEntry = false;
        }
        if (this.inHeader) {
            this.headerStack.pop();
        }
        if (name === 'tbxHeader' || name === 'martifHeader') {
            this.writeGlossaryComment();
            this.inHeader = false;
        }
        if (name === 'tbx' || name === 'martif') {
            writeFileSync(this.glsFile, '\n</glossary>', { flag: 'a' });
        }
    }

    writeGlossaryComment(): void {
        if (!this.currentHeader) {
            return;
        }
        let fileDesc: XMLElement | undefined = this.currentHeader.getChild('fileDesc');
        let sourceDesc: XMLElement | undefined = fileDesc?.getChild('sourceDesc');
        if (!sourceDesc) {
            return;
        }
        let paragraphs: XMLElement[] = sourceDesc.getChildren().filter(child => child.getName() === 'p');
        let commentText: string = '';
        for (let p of paragraphs) {
            if (commentText !== '') {
                commentText += '\n';
            }
            commentText += this.normalizeSpace(p.getText());
        }
        if (commentText === '') {
            return;
        }
        let comment: XMLElement = new XMLElement('comment');
        comment.addString(commentText);
        writeFileSync(this.glsFile, '\n' + comment.toString(), { flag: 'a' });
    }

    writeGlossaryEntry(): void {
        if (!this.currentEntry) {
            return;
        }
        let langSecs: XMLElement[] = this.currentEntry.getChildren().filter(child => child.getName() === 'langSec' || child.getName() === 'langSet');
        if (langSecs.length === 0) {
            return;
        }
        let noteParts: string[] = [this.getNoteText(this.currentEntry)];
        let langEntries: XMLElement[] = [];
        for (let langSec of langSecs) {
            let lang: XMLAttribute | undefined = langSec.getAttribute('xml:lang');
            if (!lang) {
                continue;
            }
            noteParts.push(this.getNoteText(langSec));
            let termSecs: XMLElement[] = this.getTermGroups(langSec);
            for (let termSec of termSecs) {
                let term: XMLElement | undefined = termSec.getChild('term');
                if (!term) {
                    continue;
                }
                noteParts.push(this.getNoteText(termSec));
                noteParts.push(this.getTermNoteText(termSec, lang.getValue()));
                let langEntry: XMLElement = new XMLElement('langentry');
                langEntry.setAttribute(lang);
                let termElement: XMLElement = new XMLElement('term');
                termElement.addString(term.getText());
                langEntry.addElement(termElement);
                let definitionText: string = this.getDefinitionText(termSec) || this.getDefinitionText(langSec);
                if (definitionText !== '') {
                    let definition: XMLElement = new XMLElement('definition');
                    definition.addString(definitionText);
                    langEntry.addElement(definition);
                }
                langEntries.push(langEntry);
            }
        }
        let glossentry: XMLElement = new XMLElement('glossentry');
        let notesText: string = this.combineParts(noteParts);
        if (notesText !== '') {
            let comment: XMLElement = new XMLElement('comment');
            comment.addString(notesText);
            glossentry.addElement(comment);
        }
        for (let langEntry of langEntries) {
            glossentry.addElement(langEntry);
        }
        this.indenter.indent(glossentry);
        writeFileSync(this.glsFile, '\n' + glossentry.toString(), { flag: 'a' });
    }

    combineParts(parts: string[]): string {
        return parts.filter(part => part !== '').join('\n');
    }

    getTermGroups(langSec: XMLElement): XMLElement[] {
        let groups: XMLElement[] = [];
        for (let child of langSec.getChildren()) {
            let name: string = child.getName();
            if (name === 'termSec' || name === 'tig' || name === 'termGrp') {
                groups.push(child);
            } else if (name === 'ntig') {
                let termGrp: XMLElement | undefined = child.getChild('termGrp');
                if (termGrp) {
                    groups.push(termGrp);
                }
            }
        }
        return groups;
    }

    getDescrips(parent: XMLElement): XMLElement[] {
        let descrips: XMLElement[] = [];
        for (let child of parent.getChildren()) {
            let name: string = child.getName();
            if (name === 'descrip') {
                descrips.push(child);
            } else if (name === 'descripGrp') {
                descrips.push(...child.getChildren().filter(c => c.getName() === 'descrip'));
            }
        }
        return descrips;
    }

    getDefinitionText(parent: XMLElement): string {
        let definitionText: string = '';
        let descripElements: XMLElement[] = this.getDescrips(parent);
        for (let descrip of descripElements) {
            let type: XMLAttribute | undefined = descrip.getAttribute('type');
            if (!type || type.getValue() !== 'definition') {
                continue;
            }
            if (definitionText !== '') {
                definitionText += '\n';
            }
            definitionText += this.normalizeSpace(descrip.getText());
        }
        return definitionText;
    }

    getNoteText(parent: XMLElement): string {
        let noteText: string = '';
        let notes: XMLElement[] = parent.getChildren().filter(child => child.getName() === 'note');
        for (let note of notes) {
            if (noteText !== '') {
                noteText += '\n';
            }
            noteText += this.normalizeSpace(note.getText());
        }
        return noteText;
    }

    getTermNoteText(parent: XMLElement, lang: string): string {
        let noteText: string = '';
        let termNotes: XMLElement[] = parent.getChildren().filter(child => child.getName() === 'termNote');
        for (let termNote of termNotes) {
            if (noteText !== '') {
                noteText += '\n';
            }
            let type: XMLAttribute | undefined = termNote.getAttribute('type');
            noteText += `[${lang}] ${type ? type.getValue() + ': ' : ''}${this.normalizeSpace(termNote.getText())}`;
        }
        return noteText;
    }

    normalizeSpace(text: string): string {
        return text.replace(/\s+/g, ' ').trim();
    }

    internalSubset(declaration: string): void {
        // do nothing
    }

    characters(ch: string): void {
        if (this.inConceptEntry && this.stack.length > 0) {
            this.stack[this.stack.length - 1].addString(ch);
        }
        if (this.inHeader && this.headerStack.length > 0) {
            this.headerStack[this.headerStack.length - 1].addString(ch);
        }
    }

    ignorableWhitespace(ch: string): void {
        if (this.inConceptEntry && this.stack.length > 0) {
            this.stack[this.stack.length - 1].addString(ch);
        }
        if (this.inHeader && this.headerStack.length > 0) {
            this.headerStack[this.headerStack.length - 1].addString(ch);
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
