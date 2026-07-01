import { readJSON } from '../../utils.js'

const tags = readJSON('./tags.json');
const tagsBrowse = readJSON('./tags_browse.json');

export class TagModel {

    /**
     * Filtra múltiples tags en un rango de tiempo simulado.
     * @param {string[]} tagnames      - Array de nombres de tag
     * @param {string}   startTimestamp - ISO string o fecha 'YYYY-MM-DD HH:mm:ss'
     * @param {string}   endTimestamp   - ISO string o fecha 'YYYY-MM-DD HH:mm:ss'
     */
    static async getByTags(tagnames, startTimestamp, endTimestamp) {
        const start = new Date(startTimestamp);
        const end = new Date(endTimestamp);
        const upper = tagnames.map(t => t.toUpperCase());

        return tags.filter(row => {
            const ts = new Date(row.TIMESTAMP);
            return upper.includes(row.TAGNAME.toUpperCase())
                && ts >= start
                && ts <= end;
        });
    }

    /**
     * Filtra un único tag en un rango de tiempo simulado.
     * @param {string} tagname        - Nombre del tag
     * @param {string} startTimestamp - ISO string o fecha 'YYYY-MM-DD HH:mm:ss'
     * @param {string} endTimestamp   - ISO string o fecha 'YYYY-MM-DD HH:mm:ss'
     */
    static async getByTag(tagname, startTimestamp, endTimestamp) {
        const start = new Date(startTimestamp);
        const end = new Date(endTimestamp);

        return tags.filter(row => {
            const ts = new Date(row.TIMESTAMP);
            return row.TAGNAME.toUpperCase() === tagname.toUpperCase()
                && ts >= start
                && ts <= end;
        });
    }

    /**
     * Simula PHD_TAG_BROWSE para un tag en modo local.
     * Busca en tags_browse.json por TAGNAME (case-insensitive).
     */
    static async browseTag(tagname) {
        const upper = tagname.toUpperCase();
        const found = tagsBrowse.find(row => row.TAGNAME?.toUpperCase() === upper);
        if (!found) return [];
        return [{
            tagname: found.TAGNAME,
            description: found.DESCRIPTION ?? null,
            tagno: found.TAGNO ?? null,
            units: found.UNITS ?? null,
            data_type_name: found.DATA_TYPE_NAME ?? null,
            asset_name: found.ASSET_NAME ?? null,
        }];
    }

}