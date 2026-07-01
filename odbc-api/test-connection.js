import odbc from 'odbc';

async function testConexion() {
    const connectionString = 'DSN=PHD;UID=tat_admin;PWD=ExperionR511';
    let connection;

    try {
        connection = await odbc.connect(connectionString);
        console.log('Conectado correctamente al DSN PHD');
    } catch (error) {
        console.error('Falló la conexión:');
        console.error(error);
    } finally {
        if (connection) {
            await connection.close();
            console.log('Conexión cerrada');
        }
    }
}

testConexion();