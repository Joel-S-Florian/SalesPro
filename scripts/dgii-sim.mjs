// Simulador local de la DGII para desarrollar la facturación electrónica sin certificado ni acceso real.
//
//   node scripts/dgii-sim.mjs [puerto]        (por defecto 4090)
//
// Luego, en apps/api/.env:  ECF_BASE_URL_OVERRIDE=http://localhost:4090
// Variables opcionales: SIM_TOKEN_TTL_SECONDS (por defecto 3600; use 60 para probar la renovación del token).
import { createDgiiSimulator } from '../apps/api/src/modules/ecf/sim/dgii-simulator.js';

const port = Number(process.argv[2] || process.env.SIM_PORT || 4090);
const { app, state } = createDgiiSimulator({ tokenTtlSeconds: Number(process.env.SIM_TOKEN_TTL_SECONDS || 3600), publicUrl: `http://localhost:${port}` });

app.listen(port, () => {
  console.log(`Simulador DGII escuchando en http://localhost:${port}  (token de ${state.tokenTtlSeconds} s)`);
  console.log('Servicios: /{testecf|certecf|ecf}/autenticacion, /recepcion, /recepcionfc, /consultaresultado, /consultadirectorio, /aprobacioncomercial');
  console.log('Otro contribuyente simulado (RNC 101010101): /receptor-sim/fe/recepcion/api/ecf y /fe/aprobacioncomercial/api/ecf');
});
