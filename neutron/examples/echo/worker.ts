import { init, send } from 'neutron/worker';

self.addEventListener(
  'message',
  (e) => {
    const data = e.data as { lengthBuffer?: SharedArrayBuffer };
    if (data && data.lengthBuffer) {
      init(e.data);
      main();
    }
  },
  { once: true },
);

function main() {
  const greeting = send({ type: 'greet', name: 'world' });
  console.log('worker got:', greeting);

  const sum = send({ type: 'add', a: 2, b: 3 });
  console.log('2 + 3 =', sum);

  try {
    send({ type: 'oops' });
  } catch (err) {
    console.error('caught:', (err as Error).message);
  }
}
