import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Project, ProjectCosting, VariationOrder,
  PurchaseOrder, VendorInvoice, Entity, UserProfile, ProjectCashTransfer,
} from '../types';
import { computeMarginTransferPosition, MarginTransferPosition } from '../utils/marginTransfer';

export interface POWithInvoices extends PurchaseOrder {
  invoices: VendorInvoice[];
}

export interface ClientMilestoneRow {
  id: string;
  milestone_number: number;
  milestone_description: string;
  milestone_pct: number;
  payment_plan_amount: number;
  planned_receive_date?: string;
  status: string;
}

export interface ClientInvoiceRow {
  id: string;
  client_milestone_id: string;
  invoice_no?: string;
  invoice_date?: string;
  receipt_date?: string;
  invoice_amount: number;
  received_amount: number;
  status: string;
}

export interface PoMilestoneRow {
  id: string;
  purchase_order_id: string;
  milestone_number: number;
  milestone_pct: number;
  amount_due: number;
  paid_amount: number;
  invoice_date?: string;
  planned_payment_date?: string;
  status: string;
}

export interface ProjectData {
  project: Project | null;
  costings: ProjectCosting[];
  vos: VariationOrder[];
  orders: POWithInvoices[];
  orphanVendorInvoices: { id: string; invoice_date?: string; received_amount: number }[];
  clientMilestones: ClientMilestoneRow[];
  clientInvoices: ClientInvoiceRow[];
  poMilestones: PoMilestoneRow[];
  vendors: Entity[];
  profiles: UserProfile[];
  marginPosition: MarginTransferPosition | null;
  transfers: ProjectCashTransfer[];
  allActiveProjects: Project[];
  loading: boolean;
  reload: () => Promise<void>;
}

export function useProjectData(id: string | undefined): ProjectData {
  const [project, setProject] = useState<Project | null>(null);
  const [costings, setCostings] = useState<ProjectCosting[]>([]);
  const [vos, setVos] = useState<VariationOrder[]>([]);
  const [orders, setOrders] = useState<POWithInvoices[]>([]);
  const [orphanVendorInvoices, setOrphanVendorInvoices] = useState<{ id: string; invoice_date?: string; received_amount: number }[]>([]);
  const [clientMilestones, setClientMilestones] = useState<ClientMilestoneRow[]>([]);
  const [clientInvoices, setClientInvoices] = useState<ClientInvoiceRow[]>([]);
  const [poMilestones, setPoMilestones] = useState<PoMilestoneRow[]>([]);
  const [vendors, setVendors] = useState<Entity[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [marginPosition, setMarginPosition] = useState<MarginTransferPosition | null>(null);
  const [transfers, setTransfers] = useState<ProjectCashTransfer[]>([]);
  const [allActiveProjects, setAllActiveProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const [projRes, costRes, voRes, poRes, vendorRes, profilesRes, cmRes, ciRes] = await Promise.all([
      supabase.from('projects').select('*, client:entities!client_entity_id(*)').eq('id', id).maybeSingle(),
      supabase.from('project_costings').select('*').eq('project_id', id),
      supabase.from('variation_orders').select('*').eq('project_id', id).order('created_at'),
      supabase.from('purchase_orders').select('*, vendor:entities!vendor_id(*), pending_invoice_amount, pending_remaining_amount').eq('project_id', id).order('created_at'),
      supabase.from('entities').select('*').eq('type', 'vendor').order('name'),
      supabase.from('user_profiles').select('*'),
      supabase.from('client_milestones').select('id, milestone_number, milestone_description, milestone_pct, payment_plan_amount, planned_receive_date, status').eq('project_id', id).order('milestone_number'),
      supabase.from('client_invoices').select('id, client_milestone_id, invoice_no, invoice_date, receipt_date, invoice_amount, received_amount, status').eq('project_id', id),
    ]);

    if (projRes.data) setProject(projRes.data as Project);
    if (costRes.data) setCostings(costRes.data as ProjectCosting[]);
    if (voRes.data) setVos(voRes.data as VariationOrder[]);
    if (vendorRes.data) setVendors(vendorRes.data as Entity[]);
    if (profilesRes.data) setProfiles(profilesRes.data as UserProfile[]);
    setClientMilestones((cmRes.data ?? []) as ClientMilestoneRow[]);
    setClientInvoices((ciRes.data ?? []) as ClientInvoiceRow[]);

    if (poRes.data) {
      const pos = poRes.data as PurchaseOrder[];
      const invoiceRes = await supabase
        .from('vendor_invoices')
        .select('*')
        .in('po_id', pos.map(p => p.id));
      const invoiceMap: Record<string, VendorInvoice[]> = {};
      ((invoiceRes.data ?? []) as VendorInvoice[]).forEach(inv => {
        if (!invoiceMap[inv.po_id]) invoiceMap[inv.po_id] = [];
        invoiceMap[inv.po_id].push(inv);
      });
      setOrders(pos.map(p => ({ ...p, invoices: invoiceMap[p.id] ?? [] })));

      const pmRes = await supabase
        .from('po_milestones')
        .select('id, purchase_order_id, milestone_number, milestone_pct, amount_due, paid_amount, invoice_date, planned_payment_date, status')
        .in('purchase_order_id', pos.map(p => p.id));
      setPoMilestones((pmRes.data ?? []) as PoMilestoneRow[]);
    }

    const orphanRes = await supabase
      .from('vendor_invoices')
      .select('id, invoice_date, received_amount')
      .eq('project_id', id)
      .is('po_id', null)
      .gt('received_amount', 0);
    setOrphanVendorInvoices((orphanRes.data ?? []) as { id: string; invoice_date?: string; received_amount: number }[]);

    if (projRes.data && (projRes.data as Project).status === 'active') {
      const [pos, transfersRes, activeProj] = await Promise.all([
        computeMarginTransferPosition(supabase, id),
        supabase
          .from('project_cash_transfers')
          .select('*, from_project:projects!from_project_id(id,name), to_project:projects!to_project_id(id,name)')
          .or(`from_project_id.eq.${id},to_project_id.eq.${id}`)
          .order('created_at', { ascending: false }),
        supabase.from('projects').select('id, name').eq('status', 'active').neq('id', id).order('name'),
      ]);
      setMarginPosition(pos);
      setTransfers((transfersRes.data ?? []) as ProjectCashTransfer[]);
      setAllActiveProjects((activeProj.data ?? []) as Project[]);
    } else {
      setMarginPosition(null);
      setTransfers([]);
      setAllActiveProjects([]);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  return {
    project, costings, vos, orders, orphanVendorInvoices,
    clientMilestones, clientInvoices, poMilestones, vendors, profiles,
    marginPosition, transfers, allActiveProjects, loading, reload,
  };
}
