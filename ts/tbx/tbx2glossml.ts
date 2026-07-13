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
import { TBXHandler } from "./tbxHandler.js";

export class TBX2GlossML {

    tbxHandler: TBXHandler;

    constructor(tbxFilePath: string, glossMLFilePath: string, catalogPath: string) {
        this.tbxHandler = new TBXHandler(glossMLFilePath);
        let catalog: Catalog = new Catalog(catalogPath);
        let  parser:SAXParser = new SAXParser();
        parser.setContentHandler(this.tbxHandler);
        parser.setCatalog(catalog);
        parser.parseFile(tbxFilePath);
    }
}