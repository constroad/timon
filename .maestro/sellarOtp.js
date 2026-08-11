// Sella un código conocido sobre el OTP que la app ACABA de pedir.
//
// Corre en la Mac (no en el emulador), así que el server es `localhost`. El
// endpoint solo existe fuera de producción y con `QA_OTP_SECRET` definido.
const respuesta = http.post('http://localhost:3000/api/public/app/qa-otp', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    companyId: 'test',
    phone: '987654321',
    code: '123456',
    secret: 'timon-e2e-local',
  }),
});

if (respuesta.status !== 200) {
  throw new Error('No se pudo sellar el OTP: ' + respuesta.status + ' ' + respuesta.body);
}
