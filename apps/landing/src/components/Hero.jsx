import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Play } from 'lucide-react';
import LiveReceipt from './LiveReceipt';
import { SIGNUP_URL } from '../config';

const rise = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

export default function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden bg-ink text-white">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(70%_60%_at_70%_40%,black,transparent)]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-40 top-10 h-[34rem] w-[34rem] rounded-full bg-brand/30 blur-[120px]" aria-hidden="true" />

      <div className="container-x relative grid items-center gap-14 pb-20 pt-32 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:pb-28 lg:pt-36">
        <div>
          <motion.p
            {...rise}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[13px] font-medium text-white/80"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-mint" /> Gratis durante la beta · sin tarjeta
          </motion.p>

          <motion.h1
            {...rise}
            transition={{ duration: 0.55, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="text-[2.6rem] font-semibold leading-[1.04] sm:text-6xl lg:text-[3.7rem]"
          >
            Cobra, controla tu inventario y cierra caja sin hojas de cálculo.
          </motion.h1>

          <motion.p
            {...rise}
            transition={{ duration: 0.55, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-white/70"
          >
            FACTOS es el sistema en la nube para tiendas, colmados y ferreterías: escaneas, cobras, imprimes el ticket y al final del turno
            ves exactamente cuánto debe haber en caja.
          </motion.p>

          <motion.div
            {...rise}
            transition={{ duration: 0.55, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="mt-9 flex flex-col gap-3 sm:flex-row"
          >
            <a href={SIGNUP_URL} className="btn btn-primary press">
              Empezar gratis <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#producto" className="btn btn-ghost-dark press">
              <Play className="h-4 w-4" /> Ver el sistema
            </a>
          </motion.div>

          <motion.ul
            {...rise}
            transition={{ duration: 0.55, delay: 0.3 }}
            className="mt-10 flex flex-wrap gap-x-7 gap-y-2 text-sm text-white/60"
          >
            <li>Funciona en cualquier navegador</li>
            <li>Lector USB o cámara del celular</li>
            <li>Listo en minutos, sin instalar nada</li>
          </motion.ul>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <LiveReceipt />
        </motion.div>
      </div>
    </section>
  );
}
