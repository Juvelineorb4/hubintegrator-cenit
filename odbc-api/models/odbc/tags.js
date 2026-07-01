import odbc from 'odbc';
import dotenv from 'dotenv';
import { toPHDDateTime } from '../../utils.js'

// Cargar variables de entorno
dotenv.config();

const CONFIG_CONNECTION_STRING = `DSN=${process.env.PHD_CONFIG_DSN};UID=${process.env.PHD_CONFIG_UUID};PWD=${process.env.PHD_CONFIG_PASSWORD}`;

async function createPool() {
    try {
        return await odbc.pool(CONFIG_CONNECTION_STRING);
    } catch (error) {
        console.error('Failed to create ODBC connection pool:', error.message);
        process.exit(1);
    }
}

const pool = await createPool();

// Cierra el pool limpiamente al apagar el servidor
process.on('SIGINT', async () => { await pool.close(); process.exit(0); });
process.on('SIGTERM', async () => { await pool.close(); process.exit(0); });

export class TagModel {

    /**
     * Consulta múltiples tags en un rango de tiempo.
     * @param {string[]} tagnames - Array de nombres de tag, ej. ['AA-FI-0001', 'AA-FI-0002']
     * @param {string}   startTimestamp - Timestamp de inicio, ej. '2026-01-01 00:00:00' o 'NOW-1h'
     * @param {string}   endTimestamp   - Timestamp de fin, ej. '2026-01-31 23:59:59' o 'NOW'
     */
    static async getByTags(tagnames, startTimestamp, endTimestamp) {
        const start = toPHDDateTime(startTimestamp);
        const end = toPHDDateTime(endTimestamp);
        try {

            console.time("TIEMPO TOTAL")
            // Paso 1: obtener data_type_name de cada tag (una consulta por tag)
            const browseResults = await Promise.all(
                tagnames.map(t => pool.query(`SELECT tagname, data_type_name FROM phd_tag_browse WHERE tagname = '${t}'`))
            );




            // Paso 2: agrupar tags por subtipo de value
            const groups = {};
            for (const rows of browseResults) {
                const row = rows[0];
                const dtype = (row.DATA_TYPE_NAME || '').toUpperCase();
                const subtype = dtype === 'STRING' ? 'value.string'
                    : dtype === 'INTEGER' ? 'value.integer'
                        : 'value.float'; // FLOAT, DOUBLE, INTEGER → float
                if (!groups[subtype]) groups[subtype] = [];
                groups[subtype].push(row.TAGNAME);
            }



            // Paso 3: consultar cada grupo en paralelo y unir resultados
            const groupEntries = Object.entries(groups);
            const groupResults = await Promise.all(
                groupEntries.map(([subtype, tags]) => {
                    const groupInList = tags.map(t => `'${t}'`).join(', ');
                    const sql = `SELECT timestamp, tagname, ${subtype}, data_type_name, CONFIDENCE FROM phd_data WHERE tagname IN (${groupInList}) AND start_timestamp='${start}' AND end_timestamp='${end}' AND raw_data='TRUE'`;
                    return pool.query(sql);
                })
            );
            const allResults = groupResults.flat();
            console.log(`Filas obtenidas: ${allResults.length}`);
            console.timeEnd("TIEMPO TOTAL")
            return allResults;
        } catch (error) {
            throw new Error(`Error querying tags [${tagnames.join(', ')}]: ${error.message}`);
        }
    }

    /**
     * Consulta un único tag en un rango de tiempo.
     * @param {string} tagname        - Nombre del tag, ej. 'AA-FI-0001'
     * @param {string} startTimestamp - Timestamp de inicio
     * @param {string} endTimestamp   - Timestamp de fin
     */
    static async getByTag(tagname, startTimestamp, endTimestamp) {
        const start = toPHDDateTime(startTimestamp)
        const end = toPHDDateTime(endTimestamp)
        const sql = `SELECT timestamp, tagname, value.float, data_type_name, confidence FROM phd_data WHERE tagname = '${tagname}' AND start_timestamp = '${start}' AND end_timestamp = '${end}' AND raw_data = 'TRUE'`;
        try {
            const result = await pool.query(sql);
            console.log(`Filas obtenidasssssssssssssssssssssssssssssssssssssssssssssssssssssss: ${result.length}`);
            return result;
        } catch (error) {
            throw new Error(`Error querying tag [${tagname}]: ${error.message}`);
        }
    }

    /**
     * Consulta el catálogo PHD_TAG_BROWSE para un tag específico.
     * @param {string} tagname - Nombre del tag, ej. 'AA-FI-0001'
     */
    static async browseTag(tagname) {
        const sql = `SELECT tagname, description, tagno, units, data_type_name, asset_name FROM phd_tag_browse WHERE tagname = '${tagname}'`;
        try {
            const result = await pool.query(sql);
            return result;
        } catch (error) {
            throw new Error(`Error browsing tag [${tagname}]: ${error.message}`);
        }
    }


    /**
             * Consulta múltiples tags en un rango de tiempo.
             * @param {string[]} tagnames - Array de nombres de tag, ej. ['AA-FI-0001', 'AA-FI-0002']
             * @param {string}   startTimestamp - Timestamp de inicio, ej. '2026-01-01 00:00:00' o 'NOW-1h'
             * @param {string}   endTimestamp   - Timestamp de fin, ej. '2026-01-31 23:59:59' o 'NOW'
             * @param {string}   inverval_seconds   -  Inverval en Seg ejemplo 60 (1 min) 3600 (1 Hour) - Remember ODBC acepta en milisegundos
             */
    static async getTagsByInterval(tagnames, startTimestamp, endTimestamp, inverval_seconds) {
        const interval_miliseconds = inverval_seconds * 1000
        const start = toPHDDateTime(startTimestamp);
        const end = toPHDDateTime(endTimestamp);
        try {
            console.time("TIEMPO TOTAL")
            // Paso 1: obtener data_type_name de cada tag (una consulta por tag)
            const browseResults = await Promise.all(
                tagnames.map(t => pool.query(`SELECT tagname, data_type_name FROM phd_tag_browse WHERE tagname = '${t}'`))
            );




            // Paso 2: agrupar tags por subtipo de value
            const groups = {};
            for (const rows of browseResults) {
                const row = rows[0];
                const dtype = (row.DATA_TYPE_NAME || '').toUpperCase();
                const subtype = dtype === 'STRING' ? 'value.string'
                    : dtype === 'INTEGER' ? 'value.integer'
                        : 'value.float'; // FLOAT, DOUBLE, INTEGER → float
                if (!groups[subtype]) groups[subtype] = [];
                groups[subtype].push(row.TAGNAME);
            }



            // Paso 3: consultar cada grupo en paralelo y unir resultados
            const groupEntries = Object.entries(groups);
            const groupResults = await Promise.all(
                groupEntries.map(([subtype, tags]) => {
                    const groupInList = tags.map(t => `'${t}'`).join(', ');
                    const sql = `SELECT timestamp, tagname, ${subtype}, data_type_name, CONFIDENCE FROM phd_data WHERE tagname IN (${groupInList}) AND start_timestamp='${start}' AND end_timestamp='${end}' AND AND SAMPLE_INTERVAL='${interval_miliseconds}' AND MINIMUM_CONFIDENCE=100`;
                    return pool.query(sql);
                })
            );
            const allResults = groupResults.flat();
            console.log(`Filas obtenidas: ${allResults.length}`);
            console.timeEnd("TIEMPO TOTAL")
            return allResults;
        } catch (error) {
            throw new Error(`Error querying tags [${tagnames.join(', ')}]: ${error.message}`);
        }
    }

}