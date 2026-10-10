import { useEffect, useRef } from 'react';
import { CUSTOMER_DISPLAY_CHANNEL } from '../utils/customerDisplay';

/**
 * Publica el ticket en la pantalla del cliente (otra ventana del mismo navegador, por BroadcastChannel).
 * `payload` es el estado a mostrar; `completedSale` dispara la pantalla de agradecimiento.
 */
export function useCustomerDisplaySync(payload, completedSale) {
  const channelRef = useRef(null);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    channelRef.current = channel;
    // La pantalla del cliente pide el estado al abrirse
    channel.onmessage = event => {
      if (event.data?.type === 'hello') channel.postMessage({ type: 'cart', payload: payloadRef.current });
    };
    return () => channel.close();
  }, []);

  const serialized = JSON.stringify(payload);
  useEffect(() => {
    channelRef.current?.postMessage({ type: 'cart', payload: payloadRef.current });
  }, [serialized]);

  useEffect(() => {
    if (completedSale) {
      channelRef.current?.postMessage({
        type: 'sale-complete',
        payload: { total: Number(completedSale.total || 0) },
      });
    }
  }, [completedSale]);
}
