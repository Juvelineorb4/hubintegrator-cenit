import odbc from 'odbc';

const connectionString = 'DSN=PHD;UID=tat_admin;PWD=ExperionR511';

async function consultarPHD() {
    const query = `
    SELECT
      timestamp,
      tagname,
      value.float,
      data_type_name,
      sample_interval,
      confidence
    FROM phd_data
    WHERE tagname IN ('CAR_PT_3612.pv', 'FRE_PT_3601.pv')
      AND start_timestamp = 'NOW-1m'
      AND end_timestamp = 'now'
      AND raw_data = 'TRUE'
  `;

    let connection;

    try {
        connection = await odbc.connect(connectionString);
        console.log('Conexión ODBC exitosa');

        const result = await connection.query(query);

        console.log(`Filas obtenidas: ${result.length}`);
        console.table(result);
    } catch (error) {
        console.error('Error en la consulta ODBC:');
        console.error(error);
    } finally {
        if (connection) {
            await connection.close();
            console.log('Conexión cerrada');
        }
    }
}

consultarPHD();