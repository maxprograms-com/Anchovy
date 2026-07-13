/*******************************************************************************
 * Copyright (c) 2009-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 * Maxprograms - initial API and implementation
 *******************************************************************************/

export enum ColumnTypes {
    COMMENT = 'comment',
    DEFINITION = 'definition',
    TERM = 'term'
}

export class Column {
    type: ColumnTypes;
    lang: string | undefined;
    description: string;

    constructor(type: ColumnTypes, lang: string | undefined, description: string) {
        this.type = type;
        this.lang = lang;
        this.description = description;
    }
}