import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useTaxConfig() {
  const [vatRate, setVatRate] = useState(0.07);
  const [whtRate, setWhtRate] = useState(0.03);

  useEffect(() => {
    const fetchRates = async () => {
      const { data } = await supabase
        .from('tax_config')
        .select('vat_rate, wht_rate')
        .maybeSingle();
      if (data) {
        setVatRate(Number(data.vat_rate));
        setWhtRate(Number(data.wht_rate));
      }
    };
    fetchRates();
  }, []);

  return { vatRate, whtRate };
}
