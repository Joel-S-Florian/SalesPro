import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

const STORAGE_KEY = 'factos-terminal';

const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

/**
 * Caja (terminal) seleccionada por el usuario y su turno abierto.
 * La caja se recuerda en este equipo; si no hay una guardada se usa la predeterminada del usuario
 * o la única disponible.
 */
export function useShift() {
  const [terminals, setTerminals] = useState([]);
  const [defaultTerminalId, setDefaultTerminalId] = useState(null);
  const [terminalId, setTerminalIdState] = useState('');
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadShift = useCallback(async id => {
    if (!id) {
      setShift(null);
      return;
    }
    try {
      const result = await api.cashier.current(id);
      setShift(result?.shift || null);
    } catch {
      setShift(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mine = await api.terminals.mine();
        if (cancelled) return;
        const list = mine?.terminals || [];
        setTerminals(list);
        setDefaultTerminalId(mine?.defaultTerminalId || null);

        const stored = readStored();
        const initial = [stored, mine?.defaultTerminalId, list.length === 1 ? list[0].id : ''].find(
          id => id && list.some(t => t.id === id)
        );
        setTerminalIdState(initial || '');
        await loadShift(initial);
      } catch {
        // sin cajas disponibles: el POS sigue funcionando sin turno
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadShift]);

  const selectTerminal = useCallback(
    async id => {
      setTerminalIdState(id);
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // almacenamiento no disponible
      }
      await loadShift(id);
    },
    [loadShift]
  );

  const makeDefault = async () => {
    await api.terminals.setDefault(terminalId || null);
    setDefaultTerminalId(terminalId || null);
  };

  const openShift = async (openingBalance, openingCount) => {
    await api.cashier.open({
      terminalId,
      openingBalance: Number(openingBalance) || 0,
      ...(openingCount && Object.keys(openingCount).length ? { openingCount } : {}),
    });
    await loadShift(terminalId);
  };

  const closeShift = async ({ declaredCash, notes }) => {
    const closed = await api.cashier.close(shift.id, { declaredCash: Number(declaredCash) || 0, notes });
    setShift(null);
    return closed;
  };

  return {
    loading,
    terminals,
    terminalId,
    defaultTerminalId,
    shift,
    selectTerminal,
    makeDefault,
    openShift,
    closeShift,
    refreshShift: () => loadShift(terminalId),
  };
}
