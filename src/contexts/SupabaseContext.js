import { createContext, createElement, useContext } from 'react';
import { supabase } from '../supabaseClient';

const SupabaseContext = createContext(supabase);

export function SupabaseProvider({ client, children }) {
  return createElement(SupabaseContext.Provider, { value: client }, children);
}

export function useSupabase() {
  return useContext(SupabaseContext);
}
