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

import { Catalog, SAXParser } from "typesxml";
import { TMXHandler } from "./tmxHandler.js";

export class TMX2GlossML {

    tmxHandler: TMXHandler;

    constructor(tmxFilePath: string, glossMLFilePath: string, catalogPath: string) {
        this.tmxHandler = new TMXHandler(glossMLFilePath);
        let catalog: Catalog = new Catalog(catalogPath);
        let parser: SAXParser = new SAXParser();
        parser.setContentHandler(this.tmxHandler);
        parser.setCatalog(catalog);
        parser.parseFile(tmxFilePath);
    }
}