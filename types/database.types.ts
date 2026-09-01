/**
 * GENERATED FILE — do not edit by hand.
 *
 * Regenerate with: npm run types:generate
 * Drift check:     npm run types:check
 *
 * Source: live production schema via PostgREST OpenAPI
 * (see scripts/generate-db-types.mjs for why not `supabase gen types`).
 * Tables: 180
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      accommodation_rates: {
        Row: {
          id: string
          service_code: string
          property_name: string
          property_type: string
          star_rating: number | null
          room_type: string | null
          board_basis: string | null
          city: string | null
          base_rate_eur: number | null
          base_rate_non_eur: number | null
          season: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          supplier_name: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          tier: string | null
          single_supplement_eur: number | null
          single_supplement_non_eur: number | null
          high_season_rate_eur: number | null
          high_season_rate_non_eur: number | null
          low_season_rate_eur: number | null
          low_season_rate_non_eur: number | null
          supplier_id: string | null
          single_rate_eur: number | null
          double_rate_eur: number | null
          triple_rate_eur: number | null
          suite_rate_eur: number | null
          single_rate_non_eur: number | null
          double_rate_non_eur: number | null
          triple_rate_non_eur: number | null
          suite_rate_non_eur: number | null
          peak_season_single_eur: number | null
          peak_season_double_eur: number | null
          peak_season_triple_eur: number | null
          peak_season_suite_eur: number | null
          peak_season_single_non_eur: number | null
          peak_season_double_non_eur: number | null
          peak_season_triple_non_eur: number | null
          peak_season_suite_non_eur: number | null
          high_season_single_eur: number | null
          high_season_double_eur: number | null
          high_season_triple_eur: number | null
          high_season_suite_eur: number | null
          high_season_single_non_eur: number | null
          high_season_double_non_eur: number | null
          high_season_triple_non_eur: number | null
          high_season_suite_non_eur: number | null
          low_season_from: string | null
          low_season_to: string | null
          high_season_from: string | null
          high_season_to: string | null
          peak_season_from: string | null
          peak_season_to: string | null
          peak_season_2_from: string | null
          peak_season_2_to: string | null
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          reservations_email: string | null
          reservations_phone: string | null
          pp_double_eur: number | null
          single_supp_eur: number | null
          triple_red_eur: number | null
          pp_double_non_eur: number | null
          single_supp_non_eur: number | null
          triple_red_non_eur: number | null
          high_pp_double_eur: number | null
          high_single_supp_eur: number | null
          high_triple_red_eur: number | null
          high_pp_double_non_eur: number | null
          high_single_supp_non_eur: number | null
          high_triple_red_non_eur: number | null
          peak_pp_double_eur: number | null
          peak_single_supp_eur: number | null
          peak_triple_red_eur: number | null
          peak_pp_double_non_eur: number | null
          peak_single_supp_non_eur: number | null
          peak_triple_red_non_eur: number | null
          seasons: Json | null
          rate_currency: string | null
          property_id: string | null
        }
        Insert: {
          id?: string
          service_code: string
          property_name: string
          property_type: string
          star_rating?: number | null
          room_type?: string | null
          board_basis?: string | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tier?: string | null
          single_supplement_eur?: number | null
          single_supplement_non_eur?: number | null
          high_season_rate_eur?: number | null
          high_season_rate_non_eur?: number | null
          low_season_rate_eur?: number | null
          low_season_rate_non_eur?: number | null
          supplier_id?: string | null
          single_rate_eur?: number | null
          double_rate_eur?: number | null
          triple_rate_eur?: number | null
          suite_rate_eur?: number | null
          single_rate_non_eur?: number | null
          double_rate_non_eur?: number | null
          triple_rate_non_eur?: number | null
          suite_rate_non_eur?: number | null
          peak_season_single_eur?: number | null
          peak_season_double_eur?: number | null
          peak_season_triple_eur?: number | null
          peak_season_suite_eur?: number | null
          peak_season_single_non_eur?: number | null
          peak_season_double_non_eur?: number | null
          peak_season_triple_non_eur?: number | null
          peak_season_suite_non_eur?: number | null
          high_season_single_eur?: number | null
          high_season_double_eur?: number | null
          high_season_triple_eur?: number | null
          high_season_suite_eur?: number | null
          high_season_single_non_eur?: number | null
          high_season_double_non_eur?: number | null
          high_season_triple_non_eur?: number | null
          high_season_suite_non_eur?: number | null
          low_season_from?: string | null
          low_season_to?: string | null
          high_season_from?: string | null
          high_season_to?: string | null
          peak_season_from?: string | null
          peak_season_to?: string | null
          peak_season_2_from?: string | null
          peak_season_2_to?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          reservations_email?: string | null
          reservations_phone?: string | null
          pp_double_eur?: number | null
          single_supp_eur?: number | null
          triple_red_eur?: number | null
          pp_double_non_eur?: number | null
          single_supp_non_eur?: number | null
          triple_red_non_eur?: number | null
          high_pp_double_eur?: number | null
          high_single_supp_eur?: number | null
          high_triple_red_eur?: number | null
          high_pp_double_non_eur?: number | null
          high_single_supp_non_eur?: number | null
          high_triple_red_non_eur?: number | null
          peak_pp_double_eur?: number | null
          peak_single_supp_eur?: number | null
          peak_triple_red_eur?: number | null
          peak_pp_double_non_eur?: number | null
          peak_single_supp_non_eur?: number | null
          peak_triple_red_non_eur?: number | null
          seasons?: Json | null
          rate_currency?: string | null
          property_id?: string | null
        }
        Update: {
          id?: string
          service_code?: string
          property_name?: string
          property_type?: string
          star_rating?: number | null
          room_type?: string | null
          board_basis?: string | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tier?: string | null
          single_supplement_eur?: number | null
          single_supplement_non_eur?: number | null
          high_season_rate_eur?: number | null
          high_season_rate_non_eur?: number | null
          low_season_rate_eur?: number | null
          low_season_rate_non_eur?: number | null
          supplier_id?: string | null
          single_rate_eur?: number | null
          double_rate_eur?: number | null
          triple_rate_eur?: number | null
          suite_rate_eur?: number | null
          single_rate_non_eur?: number | null
          double_rate_non_eur?: number | null
          triple_rate_non_eur?: number | null
          suite_rate_non_eur?: number | null
          peak_season_single_eur?: number | null
          peak_season_double_eur?: number | null
          peak_season_triple_eur?: number | null
          peak_season_suite_eur?: number | null
          peak_season_single_non_eur?: number | null
          peak_season_double_non_eur?: number | null
          peak_season_triple_non_eur?: number | null
          peak_season_suite_non_eur?: number | null
          high_season_single_eur?: number | null
          high_season_double_eur?: number | null
          high_season_triple_eur?: number | null
          high_season_suite_eur?: number | null
          high_season_single_non_eur?: number | null
          high_season_double_non_eur?: number | null
          high_season_triple_non_eur?: number | null
          high_season_suite_non_eur?: number | null
          low_season_from?: string | null
          low_season_to?: string | null
          high_season_from?: string | null
          high_season_to?: string | null
          peak_season_from?: string | null
          peak_season_to?: string | null
          peak_season_2_from?: string | null
          peak_season_2_to?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          reservations_email?: string | null
          reservations_phone?: string | null
          pp_double_eur?: number | null
          single_supp_eur?: number | null
          triple_red_eur?: number | null
          pp_double_non_eur?: number | null
          single_supp_non_eur?: number | null
          triple_red_non_eur?: number | null
          high_pp_double_eur?: number | null
          high_single_supp_eur?: number | null
          high_triple_red_eur?: number | null
          high_pp_double_non_eur?: number | null
          high_single_supp_non_eur?: number | null
          high_triple_red_non_eur?: number | null
          peak_pp_double_eur?: number | null
          peak_single_supp_eur?: number | null
          peak_triple_red_eur?: number | null
          peak_pp_double_non_eur?: number | null
          peak_single_supp_non_eur?: number | null
          peak_triple_red_non_eur?: number | null
          seasons?: Json | null
          rate_currency?: string | null
          property_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_rates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "supplier_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_sync_log: {
        Row: {
          id: string
          provider: string
          entity_type: string
          entity_id: string
          external_id: string | null
          external_number: string | null
          sync_status: string | null
          last_synced_at: string | null
          last_error: string | null
          retry_count: number | null
          next_retry_at: string | null
          request_payload: Json | null
          response_payload: Json | null
          created_at: string | null
          updated_at: string | null
          org_id: string
        }
        Insert: {
          id?: string
          provider: string
          entity_type: string
          entity_id: string
          external_id?: string | null
          external_number?: string | null
          sync_status?: string | null
          last_synced_at?: string | null
          last_error?: string | null
          retry_count?: number | null
          next_retry_at?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          created_at?: string | null
          updated_at?: string | null
          org_id: string
        }
        Update: {
          id?: string
          provider?: string
          entity_type?: string
          entity_id?: string
          external_id?: string | null
          external_number?: string | null
          sync_status?: string | null
          last_synced_at?: string | null
          last_error?: string | null
          retry_count?: number | null
          next_retry_at?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          created_at?: string | null
          updated_at?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_sync_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_tokens: {
        Row: {
          id: string
          user_id: string
          provider: string
          access_token: string
          refresh_token: string
          token_expiry: string
          tenant_id: string | null
          realm_id: string | null
          company_name: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          org_id: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: string
          access_token: string
          refresh_token: string
          token_expiry: string
          tenant_id?: string | null
          realm_id?: string | null
          company_name?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          org_id: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: string
          access_token?: string
          refresh_token?: string
          token_expiry?: string
          tenant_id?: string | null
          realm_id?: string | null
          company_name?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      active_tasks: {
        Row: {
          id: string | null
          title: string | null
          description: string | null
          due_date: string | null
          priority: string | null
          status: string | null
          assigned_to: string | null
          linked_type: string | null
          linked_id: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          completed_at: string | null
          archived: boolean | null
          archived_at: string | null
        }
        Insert: {
          id?: string | null
          title?: string | null
          description?: string | null
          due_date?: string | null
          priority?: string | null
          status?: string | null
          assigned_to?: string | null
          linked_type?: string | null
          linked_id?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          completed_at?: string | null
          archived?: boolean | null
          archived_at?: string | null
        }
        Update: {
          id?: string | null
          title?: string | null
          description?: string | null
          due_date?: string | null
          priority?: string | null
          status?: string | null
          assigned_to?: string | null
          linked_type?: string | null
          linked_id?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          completed_at?: string | null
          archived?: boolean | null
          archived_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "active_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          id: string
          org_id: string | null
          user_id: string
          user_email: string | null
          method: string
          path: string
          action: string
          entity_type: string | null
          entity_id: string | null
          ip: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id?: string | null
          user_id: string
          user_email?: string | null
          method: string
          path: string
          action: string
          entity_type?: string | null
          entity_id?: string | null
          ip?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string | null
          user_id?: string
          user_email?: string | null
          method?: string
          path?: string
          action?: string
          entity_type?: string | null
          entity_id?: string | null
          ip?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      activity_rates: {
        Row: {
          id: string
          service_code: string
          activity_name: string
          activity_category: string | null
          activity_type: string | null
          duration: string | null
          city: string | null
          base_rate_eur: number | null
          base_rate_non_eur: number | null
          season: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          supplier_name: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          supplier_id: string | null
          is_addon: boolean | null
          addon_note: string | null
          pricing_type: string | null
          unit_label: string | null
          min_capacity: number | null
          max_capacity: number | null
          tiers: Json | null
          rate_currency: string | null
        }
        Insert: {
          id?: string
          service_code: string
          activity_name: string
          activity_category?: string | null
          activity_type?: string | null
          duration?: string | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          supplier_id?: string | null
          is_addon?: boolean | null
          addon_note?: string | null
          pricing_type?: string | null
          unit_label?: string | null
          min_capacity?: number | null
          max_capacity?: number | null
          tiers?: Json | null
          rate_currency?: string | null
        }
        Update: {
          id?: string
          service_code?: string
          activity_name?: string
          activity_category?: string | null
          activity_type?: string | null
          duration?: string | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          supplier_id?: string | null
          is_addon?: boolean | null
          addon_note?: string | null
          pricing_type?: string | null
          unit_label?: string | null
          min_capacity?: number | null
          max_capacity?: number | null
          tiers?: Json | null
          rate_currency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memory: {
        Row: {
          id: string
          org_id: string
          memory_type: string
          subject_id: string | null
          subject_type: string | null
          subject_name: string | null
          content: string
          confidence: number | null
          observation_count: number | null
          expires_at: string | null
          created_at: string | null
          updated_at: string | null
          last_accessed_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          memory_type: string
          subject_id?: string | null
          subject_type?: string | null
          subject_name?: string | null
          content: string
          confidence?: number | null
          observation_count?: number | null
          expires_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          last_accessed_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          memory_type?: string
          subject_id?: string | null
          subject_type?: string | null
          subject_name?: string | null
          content?: string
          confidence?: number | null
          observation_count?: number | null
          expires_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          last_accessed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          id: string
          org_id: string
          agent_type: string
          triggered_by: string | null
          input_summary: string | null
          output_summary: string | null
          tokens_used: number | null
          duration_ms: number | null
          status: string | null
          itinerary_id: string | null
          memories_injected: number | null
          processed_for_memory: boolean
          created_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          agent_type: string
          triggered_by?: string | null
          input_summary?: string | null
          output_summary?: string | null
          tokens_used?: number | null
          duration_ms?: number | null
          status?: string | null
          itinerary_id?: string | null
          memories_injected?: number | null
          processed_for_memory?: boolean
          created_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          agent_type?: string
          triggered_by?: string | null
          input_summary?: string | null
          output_summary?: string | null
          tokens_used?: number | null
          duration_ms?: number | null
          status?: string | null
          itinerary_id?: string | null
          memories_injected?: number | null
          processed_for_memory?: boolean
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_team_member_mapping: {
        Row: {
          sales_agent_id: string
          team_member_id: string
        }
        Insert: {
          sales_agent_id: string
          team_member_id: string
        }
        Update: {
          sales_agent_id?: string
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_team_member_mapping_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      airport_staff: {
        Row: {
          id: string | null
          name: string | null
          role: string | null
          airport_location: string | null
          phone: string | null
          whatsapp: string | null
          email: string | null
          languages: string[] | null
          shift_times: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          emergency_contact: string | null
          tier: string | null
          is_preferred: boolean | null
        }
        Insert: {
          id?: string | null
          name?: string | null
          role?: string | null
          airport_location?: string | null
          phone?: string | null
          whatsapp?: string | null
          email?: string | null
          languages?: string[] | null
          shift_times?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          emergency_contact?: string | null
          tier?: string | null
          is_preferred?: boolean | null
        }
        Update: {
          id?: string | null
          name?: string | null
          role?: string | null
          airport_location?: string | null
          phone?: string | null
          whatsapp?: string | null
          email?: string | null
          languages?: string[] | null
          shift_times?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          emergency_contact?: string | null
          tier?: string | null
          is_preferred?: boolean | null
        }
        Relationships: []
      }
      airport_staff_rates: {
        Row: {
          id: string
          service_code: string
          airport_code: string
          airport_name: string | null
          service_type: string
          direction: string
          rate_eur: number | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          supplier_name: string | null
          is_active: boolean | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          description: string | null
          supplier_id: string | null
          rate_currency: string | null
        }
        Insert: {
          id?: string
          service_code: string
          airport_code: string
          airport_name?: string | null
          service_type: string
          direction: string
          rate_eur?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_name?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          supplier_id?: string | null
          rate_currency?: string | null
        }
        Update: {
          id?: string
          service_code?: string
          airport_code?: string
          airport_name?: string | null
          service_type?: string
          direction?: string
          rate_eur?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_name?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          supplier_id?: string | null
          rate_currency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "airport_staff_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      archived_tasks: {
        Row: {
          id: string | null
          title: string | null
          description: string | null
          due_date: string | null
          priority: string | null
          status: string | null
          assigned_to: string | null
          linked_type: string | null
          linked_id: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          completed_at: string | null
          archived: boolean | null
          archived_at: string | null
        }
        Insert: {
          id?: string | null
          title?: string | null
          description?: string | null
          due_date?: string | null
          priority?: string | null
          status?: string | null
          assigned_to?: string | null
          linked_type?: string | null
          linked_id?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          completed_at?: string | null
          archived?: boolean | null
          archived_at?: string | null
        }
        Update: {
          id?: string | null
          title?: string | null
          description?: string | null
          due_date?: string | null
          priority?: string | null
          status?: string | null
          assigned_to?: string | null
          linked_type?: string | null
          linked_id?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          completed_at?: string | null
          archived?: boolean | null
          archived_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "archived_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_rules: {
        Row: {
          id: string
          name: string
          description: string | null
          rule_type: string
          conditions: Json | null
          agent_id: string | null
          priority: number | null
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          rule_type: string
          conditions?: Json | null
          agent_id?: string | null
          priority?: number | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          rule_type?: string
          conditions?: Json | null
          agent_id?: string | null
          priority?: number | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "sales_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_rates: {
        Row: {
          id: string
          assistant_type: string
          cost_per_service: number
          is_active: boolean | null
          created_at: string | null
          supplier_id: string | null
        }
        Insert: {
          id?: string
          assistant_type: string
          cost_per_service: number
          is_active?: boolean | null
          created_at?: string | null
          supplier_id?: string | null
        }
        Update: {
          id?: string
          assistant_type?: string
          cost_per_service?: number
          is_active?: boolean | null
          created_at?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      attraction_aliases: {
        Row: {
          id: string
          canonical_name: string
          alias: string
          source_table: string
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          destination_id: string | null
        }
        Insert: {
          id?: string
          canonical_name: string
          alias: string
          source_table?: string
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          destination_id?: string | null
        }
        Update: {
          id?: string
          canonical_name?: string
          alias?: string
          source_table?: string
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          destination_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attraction_aliases_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string | null
          user_email: string | null
          user_role: string | null
          action: string
          table_name: string | null
          record_id: string | null
          old_data: Json | null
          new_data: Json | null
          changes: Json | null
          ip_address: string | null
          user_agent: string | null
          request_path: string | null
          status: string | null
          error_message: string | null
          metadata: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          user_email?: string | null
          user_role?: string | null
          action: string
          table_name?: string | null
          record_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          changes?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          request_path?: string | null
          status?: string | null
          error_message?: string | null
          metadata?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          user_email?: string | null
          user_role?: string | null
          action?: string
          table_name?: string | null
          record_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          changes?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          request_path?: string | null
          status?: string | null
          error_message?: string | null
          metadata?: Json | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partner_pricing: {
        Row: {
          id: string
          partner_id: string
          variation_id: string
          margin_percent_override: number | null
          fixed_price_per_pax: number | null
          price_1_pax: number | null
          price_2_pax: number | null
          price_3_pax: number | null
          price_4_pax: number | null
          price_5_pax: number | null
          price_6_pax: number | null
          price_7_plus_pax: number | null
          valid_from: string | null
          valid_to: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          partner_id: string
          variation_id: string
          margin_percent_override?: number | null
          fixed_price_per_pax?: number | null
          price_1_pax?: number | null
          price_2_pax?: number | null
          price_3_pax?: number | null
          price_4_pax?: number | null
          price_5_pax?: number | null
          price_6_pax?: number | null
          price_7_plus_pax?: number | null
          valid_from?: string | null
          valid_to?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          partner_id?: string
          variation_id?: string
          margin_percent_override?: number | null
          fixed_price_per_pax?: number | null
          price_1_pax?: number | null
          price_2_pax?: number | null
          price_3_pax?: number | null
          price_4_pax?: number | null
          price_5_pax?: number | null
          price_6_pax?: number | null
          price_7_plus_pax?: number | null
          valid_from?: string | null
          valid_to?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partner_pricing_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "b2b_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_partner_pricing_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partners: {
        Row: {
          id: string
          partner_code: string
          company_name: string
          contact_name: string | null
          email: string | null
          phone: string | null
          country: string | null
          currency: string | null
          default_margin_percent: number | null
          show_net_rates: boolean | null
          show_cost_breakdown: boolean | null
          pricing_model: string | null
          commission_percent: number | null
          is_active: boolean | null
          credit_limit: number | null
          payment_terms: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          org_id: string
        }
        Insert: {
          id?: string
          partner_code: string
          company_name: string
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          country?: string | null
          currency?: string | null
          default_margin_percent?: number | null
          show_net_rates?: boolean | null
          show_cost_breakdown?: boolean | null
          pricing_model?: string | null
          commission_percent?: number | null
          is_active?: boolean | null
          credit_limit?: number | null
          payment_terms?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          org_id: string
        }
        Update: {
          id?: string
          partner_code?: string
          company_name?: string
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          country?: string | null
          currency?: string | null
          default_margin_percent?: number | null
          show_net_rates?: boolean | null
          show_cost_breakdown?: boolean | null
          pricing_model?: string | null
          commission_percent?: number | null
          is_active?: boolean | null
          credit_limit?: number | null
          payment_terms?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partners_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_pricing_rules: {
        Row: {
          id: string
          rate_table: string | null
          rate_id: string | null
          service_name: string | null
          service_category: string | null
          pricing_model: string
          unit_type: string | null
          unit_capacity: number | null
          tier1_min_pax: number | null
          tier1_max_pax: number | null
          tier1_rate_eur: number | null
          tier1_label: string | null
          tier2_min_pax: number | null
          tier2_max_pax: number | null
          tier2_rate_eur: number | null
          tier2_label: string | null
          tier3_min_pax: number | null
          tier3_max_pax: number | null
          tier3_rate_eur: number | null
          tier3_label: string | null
          tier4_min_pax: number | null
          tier4_max_pax: number | null
          tier4_rate_eur: number | null
          tier4_label: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          applies_to: string | null
          org_id: string
        }
        Insert: {
          id?: string
          rate_table?: string | null
          rate_id?: string | null
          service_name?: string | null
          service_category?: string | null
          pricing_model?: string
          unit_type?: string | null
          unit_capacity?: number | null
          tier1_min_pax?: number | null
          tier1_max_pax?: number | null
          tier1_rate_eur?: number | null
          tier1_label?: string | null
          tier2_min_pax?: number | null
          tier2_max_pax?: number | null
          tier2_rate_eur?: number | null
          tier2_label?: string | null
          tier3_min_pax?: number | null
          tier3_max_pax?: number | null
          tier3_rate_eur?: number | null
          tier3_label?: string | null
          tier4_min_pax?: number | null
          tier4_max_pax?: number | null
          tier4_rate_eur?: number | null
          tier4_label?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          applies_to?: string | null
          org_id: string
        }
        Update: {
          id?: string
          rate_table?: string | null
          rate_id?: string | null
          service_name?: string | null
          service_category?: string | null
          pricing_model?: string
          unit_type?: string | null
          unit_capacity?: number | null
          tier1_min_pax?: number | null
          tier1_max_pax?: number | null
          tier1_rate_eur?: number | null
          tier1_label?: string | null
          tier2_min_pax?: number | null
          tier2_max_pax?: number | null
          tier2_rate_eur?: number | null
          tier2_label?: string | null
          tier3_min_pax?: number | null
          tier3_max_pax?: number | null
          tier3_rate_eur?: number | null
          tier3_label?: string | null
          tier4_min_pax?: number | null
          tier4_max_pax?: number | null
          tier4_rate_eur?: number | null
          tier4_label?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          applies_to?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_pricing_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_transport_packages: {
        Row: {
          id: string
          package_code: string
          package_name: string
          package_type: string
          origin_city: string | null
          destination_city: string | null
          duration_days: number | null
          sedan_rate: number | null
          sedan_capacity: number | null
          minivan_rate: number | null
          minivan_capacity: number | null
          van_rate: number | null
          van_capacity: number | null
          minibus_rate: number | null
          minibus_capacity: number | null
          bus_rate: number | null
          bus_capacity: number | null
          description: string | null
          includes: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          org_id: string
          rate_currency: string | null
        }
        Insert: {
          id?: string
          package_code: string
          package_name: string
          package_type: string
          origin_city?: string | null
          destination_city?: string | null
          duration_days?: number | null
          sedan_rate?: number | null
          sedan_capacity?: number | null
          minivan_rate?: number | null
          minivan_capacity?: number | null
          van_rate?: number | null
          van_capacity?: number | null
          minibus_rate?: number | null
          minibus_capacity?: number | null
          bus_rate?: number | null
          bus_capacity?: number | null
          description?: string | null
          includes?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          org_id: string
          rate_currency?: string | null
        }
        Update: {
          id?: string
          package_code?: string
          package_name?: string
          package_type?: string
          origin_city?: string | null
          destination_city?: string | null
          duration_days?: number | null
          sedan_rate?: number | null
          sedan_capacity?: number | null
          minivan_rate?: number | null
          minivan_capacity?: number | null
          van_rate?: number | null
          van_capacity?: number | null
          minibus_rate?: number | null
          minibus_capacity?: number | null
          bus_rate?: number | null
          bus_capacity?: number | null
          description?: string | null
          includes?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          org_id?: string
          rate_currency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_transport_packages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      b2c_quotes: {
        Row: {
          id: string
          org_id: string | null
          itinerary_id: string
          client_id: string | null
          quote_number: string | null
          num_travelers: number
          tier: string | null
          total_cost: number
          margin_percent: number
          margin_amount: number
          selling_price: number
          price_per_person: number
          currency: string
          cost_breakdown: Json | null
          status: string
          valid_until: string | null
          sent_via: string | null
          sent_at: string | null
          accepted_at: string | null
          internal_notes: string | null
          client_notes: string | null
          version: number | null
          last_modified_by: string | null
          last_modified_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          season_name: string | null
          season_uplift_percent: number
          season_uplift_amount: number
        }
        Insert: {
          id?: string
          org_id?: string | null
          itinerary_id: string
          client_id?: string | null
          quote_number?: string | null
          num_travelers?: number
          tier?: string | null
          total_cost?: number
          margin_percent?: number
          margin_amount?: number
          selling_price?: number
          price_per_person?: number
          currency?: string
          cost_breakdown?: Json | null
          status?: string
          valid_until?: string | null
          sent_via?: string | null
          sent_at?: string | null
          accepted_at?: string | null
          internal_notes?: string | null
          client_notes?: string | null
          version?: number | null
          last_modified_by?: string | null
          last_modified_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          season_name?: string | null
          season_uplift_percent?: number
          season_uplift_amount?: number
        }
        Update: {
          id?: string
          org_id?: string | null
          itinerary_id?: string
          client_id?: string | null
          quote_number?: string | null
          num_travelers?: number
          tier?: string | null
          total_cost?: number
          margin_percent?: number
          margin_amount?: number
          selling_price?: number
          price_per_person?: number
          currency?: string
          cost_breakdown?: Json | null
          status?: string
          valid_until?: string | null
          sent_via?: string | null
          sent_at?: string | null
          accepted_at?: string | null
          internal_notes?: string | null
          client_notes?: string | null
          version?: number | null
          last_modified_by?: string | null
          last_modified_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          season_name?: string | null
          season_uplift_percent?: number
          season_uplift_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "b2c_quotes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2c_quotes_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2c_quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_change_requests: {
        Row: {
          id: string
          org_id: string
          booking_id: string
          kind: string
          requested_count: number
          note: string | null
          requested_via: string
          status: string
          created_at: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          id?: string
          org_id: string
          booking_id: string
          kind?: string
          requested_count: number
          note?: string | null
          requested_via?: string
          status?: string
          created_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          booking_id?: string
          kind?: string
          requested_count?: number
          note?: string | null
          requested_via?: string
          status?: string
          created_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_change_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_change_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_extras: {
        Row: {
          id: string
          org_id: string
          booking_id: string
          passenger_id: string | null
          kind: string
          title: string
          description: string | null
          quantity: number
          unit_price: number | null
          currency: string | null
          supplier_cost: number | null
          supplier_currency: string | null
          supplier_id: string | null
          source_kind: string | null
          source_id: string | null
          replaces_service_id: string | null
          status: string
          requested_via: string
          created_at: string
          created_by: string | null
          priced_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          resolved_at: string | null
          invoiced_at: string | null
          invoice_id: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          booking_id: string
          passenger_id?: string | null
          kind?: string
          title: string
          description?: string | null
          quantity?: number
          unit_price?: number | null
          currency?: string | null
          supplier_cost?: number | null
          supplier_currency?: string | null
          supplier_id?: string | null
          source_kind?: string | null
          source_id?: string | null
          replaces_service_id?: string | null
          status?: string
          requested_via?: string
          created_at?: string
          created_by?: string | null
          priced_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          resolved_at?: string | null
          invoiced_at?: string | null
          invoice_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          booking_id?: string
          passenger_id?: string | null
          kind?: string
          title?: string
          description?: string | null
          quantity?: number
          unit_price?: number | null
          currency?: string | null
          supplier_cost?: number | null
          supplier_currency?: string | null
          supplier_id?: string | null
          source_kind?: string | null
          source_id?: string | null
          replaces_service_id?: string | null
          status?: string
          requested_via?: string
          created_at?: string
          created_by?: string | null
          priced_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          resolved_at?: string | null
          invoiced_at?: string | null
          invoice_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_extras_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_extras_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_extras_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "booking_passengers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_extras_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_extras_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_passenger_documents: {
        Row: {
          id: string
          org_id: string
          booking_id: string
          passenger_id: string
          kind: string
          label: string | null
          storage_path: string
          mime_type: string
          size_bytes: number
          original_filename: string | null
          uploaded_at: string
          uploaded_via: string
          purge_after: string | null
          purged_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          booking_id: string
          passenger_id: string
          kind?: string
          label?: string | null
          storage_path: string
          mime_type: string
          size_bytes: number
          original_filename?: string | null
          uploaded_at?: string
          uploaded_via?: string
          purge_after?: string | null
          purged_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          booking_id?: string
          passenger_id?: string
          kind?: string
          label?: string | null
          storage_path?: string
          mime_type?: string
          size_bytes?: number
          original_filename?: string | null
          uploaded_at?: string
          uploaded_via?: string
          purge_after?: string | null
          purged_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_passenger_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_passenger_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_passenger_documents_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "booking_passengers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_passengers: {
        Row: {
          id: string
          org_id: string
          booking_id: string
          title: string | null
          first_name: string
          last_name: string
          full_name: string | null
          date_of_birth: string | null
          gender: string | null
          nationality: string | null
          email: string | null
          phone: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          passport_number: string | null
          passport_expiry: string | null
          passport_issuing_country: string | null
          visa_required: boolean | null
          passenger_type: string
          is_lead_passenger: boolean | null
          room_type: string | null
          roommate_id: string | null
          meal_preference: string | null
          mobility_requirements: string | null
          medical_conditions: string | null
          special_requests: string | null
          created_at: string
          updated_at: string
          family_name_kanji: string | null
          given_name_kanji: string | null
          family_name_kana: string | null
          given_name_kana: string | null
          passport_issued_date: string | null
          passport_status: string
          passport_expected_date: string | null
          emergency_contact_kana: string | null
          emergency_contact_relationship: string | null
          postal_code: string | null
          address: string | null
          address_kana: string | null
          documents_postal_code: string | null
          documents_address: string | null
          documents_address_kana: string | null
          home_phone: string | null
          fax: string | null
          employer_name: string | null
          employer_phone: string | null
          insurance_requested: boolean | null
          insurance_plan_code: string | null
          details_submitted_at: string | null
          details_source: string | null
          insurance_application_date: string | null
          insurance_purpose: string | null
          insurance_purpose_other: string | null
          insurance_hazardous: boolean | null
          insurance_hazardous_detail: string | null
          insurance_under_treatment: boolean | null
          insurance_treatment_detail: string | null
          insurance_disability: boolean | null
          insurance_disability_detail: string | null
          insurance_other_policy: boolean | null
          insurance_other_policy_kinds: string[] | null
          insurance_other_policy_insurer: string | null
          insurance_other_policy_death_benefit: number | null
          insurance_premium_jpy: number | null
          insurance_premium_id: string | null
          insurance_confirmed_at: string | null
          insurance_confirmed_by: string | null
        }
        Insert: {
          id?: string
          org_id: string
          booking_id: string
          title?: string | null
          first_name: string
          last_name: string
          full_name?: string | null
          date_of_birth?: string | null
          gender?: string | null
          nationality?: string | null
          email?: string | null
          phone?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          passport_number?: string | null
          passport_expiry?: string | null
          passport_issuing_country?: string | null
          visa_required?: boolean | null
          passenger_type?: string
          is_lead_passenger?: boolean | null
          room_type?: string | null
          roommate_id?: string | null
          meal_preference?: string | null
          mobility_requirements?: string | null
          medical_conditions?: string | null
          special_requests?: string | null
          created_at?: string
          updated_at?: string
          family_name_kanji?: string | null
          given_name_kanji?: string | null
          family_name_kana?: string | null
          given_name_kana?: string | null
          passport_issued_date?: string | null
          passport_status?: string
          passport_expected_date?: string | null
          emergency_contact_kana?: string | null
          emergency_contact_relationship?: string | null
          postal_code?: string | null
          address?: string | null
          address_kana?: string | null
          documents_postal_code?: string | null
          documents_address?: string | null
          documents_address_kana?: string | null
          home_phone?: string | null
          fax?: string | null
          employer_name?: string | null
          employer_phone?: string | null
          insurance_requested?: boolean | null
          insurance_plan_code?: string | null
          details_submitted_at?: string | null
          details_source?: string | null
          insurance_application_date?: string | null
          insurance_purpose?: string | null
          insurance_purpose_other?: string | null
          insurance_hazardous?: boolean | null
          insurance_hazardous_detail?: string | null
          insurance_under_treatment?: boolean | null
          insurance_treatment_detail?: string | null
          insurance_disability?: boolean | null
          insurance_disability_detail?: string | null
          insurance_other_policy?: boolean | null
          insurance_other_policy_kinds?: string[] | null
          insurance_other_policy_insurer?: string | null
          insurance_other_policy_death_benefit?: number | null
          insurance_premium_jpy?: number | null
          insurance_premium_id?: string | null
          insurance_confirmed_at?: string | null
          insurance_confirmed_by?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          booking_id?: string
          title?: string | null
          first_name?: string
          last_name?: string
          full_name?: string | null
          date_of_birth?: string | null
          gender?: string | null
          nationality?: string | null
          email?: string | null
          phone?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          passport_number?: string | null
          passport_expiry?: string | null
          passport_issuing_country?: string | null
          visa_required?: boolean | null
          passenger_type?: string
          is_lead_passenger?: boolean | null
          room_type?: string | null
          roommate_id?: string | null
          meal_preference?: string | null
          mobility_requirements?: string | null
          medical_conditions?: string | null
          special_requests?: string | null
          created_at?: string
          updated_at?: string
          family_name_kanji?: string | null
          given_name_kanji?: string | null
          family_name_kana?: string | null
          given_name_kana?: string | null
          passport_issued_date?: string | null
          passport_status?: string
          passport_expected_date?: string | null
          emergency_contact_kana?: string | null
          emergency_contact_relationship?: string | null
          postal_code?: string | null
          address?: string | null
          address_kana?: string | null
          documents_postal_code?: string | null
          documents_address?: string | null
          documents_address_kana?: string | null
          home_phone?: string | null
          fax?: string | null
          employer_name?: string | null
          employer_phone?: string | null
          insurance_requested?: boolean | null
          insurance_plan_code?: string | null
          details_submitted_at?: string | null
          details_source?: string | null
          insurance_application_date?: string | null
          insurance_purpose?: string | null
          insurance_purpose_other?: string | null
          insurance_hazardous?: boolean | null
          insurance_hazardous_detail?: string | null
          insurance_under_treatment?: boolean | null
          insurance_treatment_detail?: string | null
          insurance_disability?: boolean | null
          insurance_disability_detail?: string | null
          insurance_other_policy?: boolean | null
          insurance_other_policy_kinds?: string[] | null
          insurance_other_policy_insurer?: string | null
          insurance_other_policy_death_benefit?: number | null
          insurance_premium_jpy?: number | null
          insurance_premium_id?: string | null
          insurance_confirmed_at?: string | null
          insurance_confirmed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_passengers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_passengers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_passengers_roommate_id_fkey"
            columns: ["roommate_id"]
            isOneToOne: false
            referencedRelation: "booking_passengers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_passengers_insurance_premium_id_fkey"
            columns: ["insurance_premium_id"]
            isOneToOne: false
            referencedRelation: "insurance_premiums"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payments: {
        Row: {
          id: string
          booking_id: string
          payment_type: string
          amount: number
          currency: string | null
          payment_method: string | null
          payment_date: string
          transaction_reference: string | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          booking_id: string
          payment_type: string
          amount: number
          currency?: string | null
          payment_method?: string | null
          payment_date: string
          transaction_reference?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          booking_id?: string
          payment_type?: string
          amount?: number
          currency?: string | null
          payment_method?: string | null
          payment_date?: string
          transaction_reference?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_portal_links: {
        Row: {
          id: string
          org_id: string
          booking_id: string
          token: string
          created_by: string | null
          created_at: string
          revoked_at: string | null
          expires_at: string | null
          details_locked_at: string | null
          view_count: number
          last_viewed_at: string | null
          passenger_id: string | null
          last_sent_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          booking_id: string
          token: string
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
          expires_at?: string | null
          details_locked_at?: string | null
          view_count?: number
          last_viewed_at?: string | null
          passenger_id?: string | null
          last_sent_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          booking_id?: string
          token?: string
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
          expires_at?: string | null
          details_locked_at?: string | null
          view_count?: number
          last_viewed_at?: string | null
          passenger_id?: string | null
          last_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_portal_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_portal_links_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_portal_links_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "booking_passengers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_rules: {
        Row: {
          id: string
          rule_type: string
          minimum_amount: number | null
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          rule_type: string
          minimum_amount?: number | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          rule_type?: string
          minimum_amount?: number | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      booking_supplier_status: {
        Row: {
          id: string
          booking_id: string
          supplier_type: string
          supplier_name: string
          service_date: string | null
          status: string | null
          confirmation_number: string | null
          confirmed_at: string | null
          quoted_cost: number | null
          created_at: string | null
          service_description: string | null
          supplier_id: string | null
          confirmation_notes: string | null
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          confirmed_cost: number | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          booking_id: string
          supplier_type: string
          supplier_name: string
          service_date?: string | null
          status?: string | null
          confirmation_number?: string | null
          confirmed_at?: string | null
          quoted_cost?: number | null
          created_at?: string | null
          service_description?: string | null
          supplier_id?: string | null
          confirmation_notes?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          confirmed_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          booking_id?: string
          supplier_type?: string
          supplier_name?: string
          service_date?: string | null
          status?: string | null
          confirmation_number?: string | null
          confirmed_at?: string | null
          quoted_cost?: number | null
          created_at?: string | null
          service_description?: string | null
          supplier_id?: string | null
          confirmation_notes?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          confirmed_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_supplier_status_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_supplier_status_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          id: string
          booking_code: string
          itinerary_id: string
          client_name: string
          client_email: string | null
          client_phone: string | null
          trip_name: string
          start_date: string
          end_date: string
          num_adults: number | null
          num_children: number | null
          total_cost: number | null
          currency: string | null
          tier: string | null
          status: string | null
          deposit_amount: number | null
          deposit_paid: boolean | null
          balance_due: number | null
          payment_deadline: string | null
          payment_status: string | null
          assigned_guide_id: string | null
          assigned_vehicle_id: string | null
          emergency_contact: string | null
          special_requests: string | null
          operational_notes: string | null
          created_at: string | null
          updated_at: string | null
          org_id: string
          deposit_paid_date: string | null
          emergency_phone: string | null
          cancelled_at: string | null
          cancellation_reason: string | null
          partner_id: string | null
          partner_name: string | null
          quote_id: string | null
          quote_type: string | null
          deposit_percent: number | null
          balance_due_date: string | null
          payment_schedule_overridden: boolean
          payment_schedule_note: string | null
          portal_mode: string
          base_total_cost: number | null
          extras_total: number | null
        }
        Insert: {
          id?: string
          booking_code: string
          itinerary_id: string
          client_name: string
          client_email?: string | null
          client_phone?: string | null
          trip_name: string
          start_date: string
          end_date: string
          num_adults?: number | null
          num_children?: number | null
          total_cost?: number | null
          currency?: string | null
          tier?: string | null
          status?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          balance_due?: number | null
          payment_deadline?: string | null
          payment_status?: string | null
          assigned_guide_id?: string | null
          assigned_vehicle_id?: string | null
          emergency_contact?: string | null
          special_requests?: string | null
          operational_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          org_id: string
          deposit_paid_date?: string | null
          emergency_phone?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          partner_id?: string | null
          partner_name?: string | null
          quote_id?: string | null
          quote_type?: string | null
          deposit_percent?: number | null
          balance_due_date?: string | null
          payment_schedule_overridden?: boolean
          payment_schedule_note?: string | null
          portal_mode?: string
          base_total_cost?: number | null
          extras_total?: number | null
        }
        Update: {
          id?: string
          booking_code?: string
          itinerary_id?: string
          client_name?: string
          client_email?: string | null
          client_phone?: string | null
          trip_name?: string
          start_date?: string
          end_date?: string
          num_adults?: number | null
          num_children?: number | null
          total_cost?: number | null
          currency?: string | null
          tier?: string | null
          status?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          balance_due?: number | null
          payment_deadline?: string | null
          payment_status?: string | null
          assigned_guide_id?: string | null
          assigned_vehicle_id?: string | null
          emergency_contact?: string | null
          special_requests?: string | null
          operational_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          org_id?: string
          deposit_paid_date?: string | null
          emergency_phone?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          partner_id?: string | null
          partner_name?: string | null
          quote_id?: string | null
          quote_type?: string | null
          deposit_percent?: number | null
          balance_due_date?: string | null
          payment_schedule_overridden?: boolean
          payment_schedule_note?: string | null
          portal_mode?: string
          base_total_cost?: number | null
          extras_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "b2b_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          id: string
          client_id: string
          contact_type: string
          first_name: string
          last_name: string
          relationship: string | null
          email: string | null
          phone: string | null
          date_of_birth: string | null
          passport_number: string | null
          passport_expiry: string | null
          is_primary: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          contact_type: string
          first_name: string
          last_name: string
          relationship?: string | null
          email?: string | null
          phone?: string | null
          date_of_birth?: string | null
          passport_number?: string | null
          passport_expiry?: string | null
          is_primary?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          contact_type?: string
          first_name?: string
          last_name?: string
          relationship?: string | null
          email?: string | null
          phone?: string | null
          date_of_birth?: string | null
          passport_number?: string | null
          passport_expiry?: string | null
          is_primary?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          id: string
          client_id: string
          document_type: string
          document_name: string
          file_url: string
          file_size_kb: number | null
          file_type: string | null
          description: string | null
          document_number: string | null
          issue_date: string | null
          expiry_date: string | null
          related_itinerary_id: string | null
          is_confidential: boolean | null
          uploaded_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          document_type: string
          document_name: string
          file_url: string
          file_size_kb?: number | null
          file_type?: string | null
          description?: string | null
          document_number?: string | null
          issue_date?: string | null
          expiry_date?: string | null
          related_itinerary_id?: string | null
          is_confidential?: boolean | null
          uploaded_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          document_type?: string
          document_name?: string
          file_url?: string
          file_size_kb?: number | null
          file_type?: string | null
          description?: string | null
          document_number?: string | null
          issue_date?: string | null
          expiry_date?: string | null
          related_itinerary_id?: string | null
          is_confidential?: boolean | null
          uploaded_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_related_itinerary_id_fkey"
            columns: ["related_itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      client_followups: {
        Row: {
          id: string
          client_id: string
          followup_type: string
          title: string
          description: string | null
          due_date: string
          due_time: string | null
          assigned_to: string | null
          priority: string | null
          status: string | null
          completed_at: string | null
          completed_by: string | null
          related_itinerary_id: string | null
          related_communication_id: string | null
          send_reminder: boolean | null
          reminder_sent: boolean | null
          created_at: string | null
          updated_at: string | null
          completion_notes: string | null
        }
        Insert: {
          id?: string
          client_id: string
          followup_type: string
          title: string
          description?: string | null
          due_date: string
          due_time?: string | null
          assigned_to?: string | null
          priority?: string | null
          status?: string | null
          completed_at?: string | null
          completed_by?: string | null
          related_itinerary_id?: string | null
          related_communication_id?: string | null
          send_reminder?: boolean | null
          reminder_sent?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          completion_notes?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          followup_type?: string
          title?: string
          description?: string | null
          due_date?: string
          due_time?: string | null
          assigned_to?: string | null
          priority?: string | null
          status?: string | null
          completed_at?: string | null
          completed_by?: string | null
          related_itinerary_id?: string | null
          related_communication_id?: string | null
          send_reminder?: boolean | null
          reminder_sent?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          completion_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_followups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_followups_related_itinerary_id_fkey"
            columns: ["related_itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_followups_related_communication_id_fkey"
            columns: ["related_communication_id"]
            isOneToOne: false
            referencedRelation: "communication_history"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          id: string
          client_id: string
          note_type: string
          title: string | null
          content: string
          category: string | null
          is_important: boolean | null
          is_pinned: boolean | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          note_type: string
          title?: string | null
          content: string
          category?: string | null
          is_important?: boolean | null
          is_pinned?: boolean | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          note_type?: string
          title?: string | null
          content?: string
          category?: string | null
          is_important?: boolean | null
          is_pinned?: boolean | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_preferences: {
        Row: {
          id: string
          client_id: string
          preferred_travel_style: string[] | null
          preferred_destinations: string[] | null
          preferred_activities: string[] | null
          preferred_hotel_chains: string[] | null
          room_preferences: string[] | null
          cuisine_preferences: string[] | null
          dietary_restrictions: string[] | null
          favorite_restaurants: string[] | null
          preferred_transportation_types: string[] | null
          seat_preferences: string | null
          preferred_guide_languages: string[] | null
          preferred_guide_specializations: string[] | null
          typical_budget_range: string | null
          price_sensitivity: string | null
          mobility_requirements: string | null
          health_considerations: string | null
          age_related_needs: string | null
          destinations_to_avoid: string[] | null
          activities_to_avoid: string[] | null
          typical_advance_booking_days: number | null
          preferred_booking_channels: string[] | null
          decision_making_style: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          preferred_travel_style?: string[] | null
          preferred_destinations?: string[] | null
          preferred_activities?: string[] | null
          preferred_hotel_chains?: string[] | null
          room_preferences?: string[] | null
          cuisine_preferences?: string[] | null
          dietary_restrictions?: string[] | null
          favorite_restaurants?: string[] | null
          preferred_transportation_types?: string[] | null
          seat_preferences?: string | null
          preferred_guide_languages?: string[] | null
          preferred_guide_specializations?: string[] | null
          typical_budget_range?: string | null
          price_sensitivity?: string | null
          mobility_requirements?: string | null
          health_considerations?: string | null
          age_related_needs?: string | null
          destinations_to_avoid?: string[] | null
          activities_to_avoid?: string[] | null
          typical_advance_booking_days?: number | null
          preferred_booking_channels?: string[] | null
          decision_making_style?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          preferred_travel_style?: string[] | null
          preferred_destinations?: string[] | null
          preferred_activities?: string[] | null
          preferred_hotel_chains?: string[] | null
          room_preferences?: string[] | null
          cuisine_preferences?: string[] | null
          dietary_restrictions?: string[] | null
          favorite_restaurants?: string[] | null
          preferred_transportation_types?: string[] | null
          seat_preferences?: string | null
          preferred_guide_languages?: string[] | null
          preferred_guide_specializations?: string[] | null
          typical_budget_range?: string | null
          price_sensitivity?: string | null
          mobility_requirements?: string | null
          health_considerations?: string | null
          age_related_needs?: string | null
          destinations_to_avoid?: string[] | null
          activities_to_avoid?: string[] | null
          typical_advance_booking_days?: number | null
          preferred_booking_channels?: string[] | null
          decision_making_style?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_summary: {
        Row: {
          id: string | null
          client_code: string | null
          first_name: string | null
          last_name: string | null
          email: string | null
          phone: string | null
          nationality: string | null
          client_type: string | null
          vip_status: boolean | null
          status: string | null
          lead_source: string | null
          created_at: string | null
          last_contacted_at: string | null
          total_bookings_count: number | null
          total_revenue_generated: number | null
          pending_followups: number | null
          total_communications: number | null
        }
        Insert: {
          id?: string | null
          client_code?: string | null
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone?: string | null
          nationality?: string | null
          client_type?: string | null
          vip_status?: boolean | null
          status?: string | null
          lead_source?: string | null
          created_at?: string | null
          last_contacted_at?: string | null
          total_bookings_count?: number | null
          total_revenue_generated?: number | null
          pending_followups?: number | null
          total_communications?: number | null
        }
        Update: {
          id?: string | null
          client_code?: string | null
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone?: string | null
          nationality?: string | null
          client_type?: string | null
          vip_status?: boolean | null
          status?: string | null
          lead_source?: string | null
          created_at?: string | null
          last_contacted_at?: string | null
          total_bookings_count?: number | null
          total_revenue_generated?: number | null
          pending_followups?: number | null
          total_communications?: number | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          client_code: string
          first_name: string
          last_name: string
          email: string | null
          phone: string | null
          alternative_phone: string | null
          nationality: string | null
          passport_type: string | null
          date_of_birth: string | null
          preferred_language: string | null
          country: string | null
          city: string | null
          address_line1: string | null
          address_line2: string | null
          postal_code: string | null
          preferred_contact_method: string | null
          best_time_to_contact: string | null
          timezone: string | null
          preferred_accommodation_level: string | null
          dietary_restrictions: string[] | null
          accessibility_needs: string[] | null
          special_interests: string[] | null
          company_name: string | null
          job_title: string | null
          is_travel_agent: boolean | null
          agent_commission_rate: number | null
          client_type: string | null
          vip_status: boolean | null
          client_source: string | null
          referred_by_client_id: string | null
          marketing_consent: boolean | null
          newsletter_subscribed: boolean | null
          sms_consent: boolean | null
          total_bookings_count: number | null
          total_revenue_generated: number | null
          currency_preference: string | null
          average_booking_value: number | null
          status: string | null
          tags: string[] | null
          rating: number | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          last_contacted_at: string | null
          internal_notes: string | null
          lead_source: string | null
          revenue_by_currency: Json
          collected_by_currency: Json
          revenue_currency: string | null
          org_id: string
        }
        Insert: {
          id?: string
          client_code: string
          first_name: string
          last_name: string
          email?: string | null
          phone?: string | null
          alternative_phone?: string | null
          nationality?: string | null
          passport_type?: string | null
          date_of_birth?: string | null
          preferred_language?: string | null
          country?: string | null
          city?: string | null
          address_line1?: string | null
          address_line2?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          best_time_to_contact?: string | null
          timezone?: string | null
          preferred_accommodation_level?: string | null
          dietary_restrictions?: string[] | null
          accessibility_needs?: string[] | null
          special_interests?: string[] | null
          company_name?: string | null
          job_title?: string | null
          is_travel_agent?: boolean | null
          agent_commission_rate?: number | null
          client_type?: string | null
          vip_status?: boolean | null
          client_source?: string | null
          referred_by_client_id?: string | null
          marketing_consent?: boolean | null
          newsletter_subscribed?: boolean | null
          sms_consent?: boolean | null
          total_bookings_count?: number | null
          total_revenue_generated?: number | null
          currency_preference?: string | null
          average_booking_value?: number | null
          status?: string | null
          tags?: string[] | null
          rating?: number | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          last_contacted_at?: string | null
          internal_notes?: string | null
          lead_source?: string | null
          revenue_by_currency: Json
          collected_by_currency: Json
          revenue_currency?: string | null
          org_id: string
        }
        Update: {
          id?: string
          client_code?: string
          first_name?: string
          last_name?: string
          email?: string | null
          phone?: string | null
          alternative_phone?: string | null
          nationality?: string | null
          passport_type?: string | null
          date_of_birth?: string | null
          preferred_language?: string | null
          country?: string | null
          city?: string | null
          address_line1?: string | null
          address_line2?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          best_time_to_contact?: string | null
          timezone?: string | null
          preferred_accommodation_level?: string | null
          dietary_restrictions?: string[] | null
          accessibility_needs?: string[] | null
          special_interests?: string[] | null
          company_name?: string | null
          job_title?: string | null
          is_travel_agent?: boolean | null
          agent_commission_rate?: number | null
          client_type?: string | null
          vip_status?: boolean | null
          client_source?: string | null
          referred_by_client_id?: string | null
          marketing_consent?: boolean | null
          newsletter_subscribed?: boolean | null
          sms_consent?: boolean | null
          total_bookings_count?: number | null
          total_revenue_generated?: number | null
          currency_preference?: string | null
          average_booking_value?: number | null
          status?: string | null
          tags?: string[] | null
          rating?: number | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          last_contacted_at?: string | null
          internal_notes?: string | null
          lead_source?: string | null
          revenue_by_currency?: Json
          collected_by_currency?: Json
          revenue_currency?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_referred_by_client_id_fkey"
            columns: ["referred_by_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          id: string
          itinerary_id: string | null
          supplier_id: string | null
          client_id: string | null
          commission_type: string
          category: string
          source_name: string | null
          source_contact: string | null
          description: string | null
          base_amount: number | null
          cost_amount: number | null
          commission_rate: number | null
          commission_amount: number
          currency: string | null
          status: string | null
          transaction_date: string | null
          due_date: string | null
          paid_date: string | null
          payment_method: string | null
          payment_reference: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          org_id: string
        }
        Insert: {
          id?: string
          itinerary_id?: string | null
          supplier_id?: string | null
          client_id?: string | null
          commission_type: string
          category: string
          source_name?: string | null
          source_contact?: string | null
          description?: string | null
          base_amount?: number | null
          cost_amount?: number | null
          commission_rate?: number | null
          commission_amount: number
          currency?: string | null
          status?: string | null
          transaction_date?: string | null
          due_date?: string | null
          paid_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          org_id: string
        }
        Update: {
          id?: string
          itinerary_id?: string | null
          supplier_id?: string | null
          client_id?: string | null
          commission_type?: string
          category?: string
          source_name?: string | null
          source_contact?: string | null
          description?: string | null
          base_amount?: number | null
          cost_amount?: number | null
          commission_rate?: number | null
          commission_amount?: number
          currency?: string | null
          status?: string | null
          transaction_date?: string | null
          due_date?: string | null
          paid_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_drafts: {
        Row: {
          id: string
          thread_id: string
          inbox_message_id: string
          parent_draft_id: string | null
          draft_body: string
          edited_body: string | null
          was_edited: boolean
          operator_notes: string | null
          ai_model: string | null
          ai_confidence: string | null
          ai_flags: Json | null
          context_used: Json | null
          generation_time_ms: number | null
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          sent_at: string | null
          send_channel: string | null
          send_message_id: string | null
          send_error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          thread_id: string
          inbox_message_id: string
          parent_draft_id?: string | null
          draft_body: string
          edited_body?: string | null
          was_edited?: boolean
          operator_notes?: string | null
          ai_model?: string | null
          ai_confidence?: string | null
          ai_flags?: Json | null
          context_used?: Json | null
          generation_time_ms?: number | null
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          sent_at?: string | null
          send_channel?: string | null
          send_message_id?: string | null
          send_error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          thread_id?: string
          inbox_message_id?: string
          parent_draft_id?: string | null
          draft_body?: string
          edited_body?: string | null
          was_edited?: boolean
          operator_notes?: string | null
          ai_model?: string | null
          ai_confidence?: string | null
          ai_flags?: Json | null
          context_used?: Json | null
          generation_time_ms?: number | null
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          sent_at?: string | null
          send_channel?: string | null
          send_message_id?: string | null
          send_error?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_drafts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_drafts_inbox_message_id_fkey"
            columns: ["inbox_message_id"]
            isOneToOne: false
            referencedRelation: "communication_inbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_drafts_parent_draft_id_fkey"
            columns: ["parent_draft_id"]
            isOneToOne: false
            referencedRelation: "communication_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_history: {
        Row: {
          id: string
          client_id: string
          communication_type: string
          direction: string
          subject: string | null
          content: string | null
          whatsapp_conversation_text: string | null
          email_from: string | null
          email_to: string | null
          email_cc: string | null
          phone_duration_minutes: number | null
          phone_number: string | null
          handled_by: string | null
          status: string | null
          priority: string | null
          related_itinerary_id: string | null
          attachments: Json | null
          communication_date: string | null
          created_at: string | null
          internal_notes: string | null
        }
        Insert: {
          id?: string
          client_id: string
          communication_type: string
          direction: string
          subject?: string | null
          content?: string | null
          whatsapp_conversation_text?: string | null
          email_from?: string | null
          email_to?: string | null
          email_cc?: string | null
          phone_duration_minutes?: number | null
          phone_number?: string | null
          handled_by?: string | null
          status?: string | null
          priority?: string | null
          related_itinerary_id?: string | null
          attachments?: Json | null
          communication_date?: string | null
          created_at?: string | null
          internal_notes?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          communication_type?: string
          direction?: string
          subject?: string | null
          content?: string | null
          whatsapp_conversation_text?: string | null
          email_from?: string | null
          email_to?: string | null
          email_cc?: string | null
          phone_duration_minutes?: number | null
          phone_number?: string | null
          handled_by?: string | null
          status?: string | null
          priority?: string | null
          related_itinerary_id?: string | null
          attachments?: Json | null
          communication_date?: string | null
          created_at?: string | null
          internal_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_history_related_itinerary_id_fkey"
            columns: ["related_itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_inbox: {
        Row: {
          id: string
          thread_id: string
          channel: string
          source_message_id: string
          sender_name: string | null
          sender_contact: string
          message_body: string
          message_snippet: string | null
          subject: string | null
          status: string
          received_at: string
          processed_at: string | null
          created_at: string
          last_error: string | null
        }
        Insert: {
          id?: string
          thread_id: string
          channel: string
          source_message_id: string
          sender_name?: string | null
          sender_contact: string
          message_body: string
          message_snippet?: string | null
          subject?: string | null
          status?: string
          received_at?: string
          processed_at?: string | null
          created_at?: string
          last_error?: string | null
        }
        Update: {
          id?: string
          thread_id?: string
          channel?: string
          source_message_id?: string
          sender_name?: string | null
          sender_contact?: string
          message_body?: string
          message_snippet?: string | null
          subject?: string | null
          status?: string
          received_at?: string
          processed_at?: string | null
          created_at?: string
          last_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_inbox_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_threads: {
        Row: {
          id: string
          channel: string
          whatsapp_conversation_id: string | null
          email_conversation_id: string | null
          client_id: string | null
          client_name: string | null
          contact_info: string
          subject: string | null
          status: string
          urgency: string
          last_message_at: string | null
          last_draft_at: string | null
          message_count: number
          created_at: string
          updated_at: string
          brief_id: string | null
          origin: string | null
          org_id: string | null
        }
        Insert: {
          id?: string
          channel: string
          whatsapp_conversation_id?: string | null
          email_conversation_id?: string | null
          client_id?: string | null
          client_name?: string | null
          contact_info: string
          subject?: string | null
          status?: string
          urgency?: string
          last_message_at?: string | null
          last_draft_at?: string | null
          message_count?: number
          created_at?: string
          updated_at?: string
          brief_id?: string | null
          origin?: string | null
          org_id?: string | null
        }
        Update: {
          id?: string
          channel?: string
          whatsapp_conversation_id?: string | null
          email_conversation_id?: string | null
          client_id?: string | null
          client_name?: string | null
          contact_info?: string
          subject?: string | null
          status?: string
          urgency?: string
          last_message_at?: string | null
          last_draft_at?: string | null
          message_count?: number
          created_at?: string
          updated_at?: string
          brief_id?: string | null
          origin?: string | null
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_threads_whatsapp_conversation_id_fkey"
            columns: ["whatsapp_conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_email_conversation_id_fkey"
            columns: ["email_conversation_id"]
            isOneToOne: false
            referencedRelation: "email_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "concierge_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      concierge_brief_revisions: {
        Row: {
          id: string
          brief_id: string
          conversation_id: string
          brief_revision: number
          is_update: boolean | null
          payload: Json
          request_id: string | null
          received_at: string
        }
        Insert: {
          id?: string
          brief_id: string
          conversation_id: string
          brief_revision: number
          is_update?: boolean | null
          payload: Json
          request_id?: string | null
          received_at?: string
        }
        Update: {
          id?: string
          brief_id?: string
          conversation_id?: string
          brief_revision?: number
          is_update?: boolean | null
          payload?: Json
          request_id?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "concierge_brief_revisions_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "concierge_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      concierge_briefs: {
        Row: {
          id: string
          conversation_id: string
          session_id: string | null
          brief_revision: number
          is_update: boolean
          prompt_version: string | null
          language: string | null
          submitted_at: string | null
          received_at: string
          visitor_name: string | null
          visitor_email: string | null
          visitor_phone: string | null
          preferred_contact: string | null
          visitor_timezone: string | null
          travelers_count: number | null
          travelers_detail: string | null
          dates_specific: string | null
          dates_window: string | null
          trip_length_days: number | null
          origin_city: string | null
          nationality: string | null
          international_flights: boolean | null
          destinations: Json | null
          comfort_level: string | null
          interests: Json | null
          must_see: Json | null
          must_avoid: Json | null
          constraint_dietary: string | null
          constraint_mobility: string | null
          constraint_religious: string | null
          constraint_medical: string | null
          brief_summary: string | null
          full_transcript: Json | null
          committed_response_by: string | null
          cairo_time_label: string | null
          visitor_local_label: string | null
          client_id: string | null
          review_status: string
          is_actionable: boolean
          flags: string[]
          raw_payload: Json
          request_id: string | null
          created_at: string
          updated_at: string
          org_id: string | null
        }
        Insert: {
          id?: string
          conversation_id: string
          session_id?: string | null
          brief_revision?: number
          is_update?: boolean
          prompt_version?: string | null
          language?: string | null
          submitted_at?: string | null
          received_at?: string
          visitor_name?: string | null
          visitor_email?: string | null
          visitor_phone?: string | null
          preferred_contact?: string | null
          visitor_timezone?: string | null
          travelers_count?: number | null
          travelers_detail?: string | null
          dates_specific?: string | null
          dates_window?: string | null
          trip_length_days?: number | null
          origin_city?: string | null
          nationality?: string | null
          international_flights?: boolean | null
          destinations?: Json | null
          comfort_level?: string | null
          interests?: Json | null
          must_see?: Json | null
          must_avoid?: Json | null
          constraint_dietary?: string | null
          constraint_mobility?: string | null
          constraint_religious?: string | null
          constraint_medical?: string | null
          brief_summary?: string | null
          full_transcript?: Json | null
          committed_response_by?: string | null
          cairo_time_label?: string | null
          visitor_local_label?: string | null
          client_id?: string | null
          review_status?: string
          is_actionable?: boolean
          flags: string[]
          raw_payload: Json
          request_id?: string | null
          created_at?: string
          updated_at?: string
          org_id?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string
          session_id?: string | null
          brief_revision?: number
          is_update?: boolean
          prompt_version?: string | null
          language?: string | null
          submitted_at?: string | null
          received_at?: string
          visitor_name?: string | null
          visitor_email?: string | null
          visitor_phone?: string | null
          preferred_contact?: string | null
          visitor_timezone?: string | null
          travelers_count?: number | null
          travelers_detail?: string | null
          dates_specific?: string | null
          dates_window?: string | null
          trip_length_days?: number | null
          origin_city?: string | null
          nationality?: string | null
          international_flights?: boolean | null
          destinations?: Json | null
          comfort_level?: string | null
          interests?: Json | null
          must_see?: Json | null
          must_avoid?: Json | null
          constraint_dietary?: string | null
          constraint_mobility?: string | null
          constraint_religious?: string | null
          constraint_medical?: string | null
          brief_summary?: string | null
          full_transcript?: Json | null
          committed_response_by?: string | null
          cairo_time_label?: string | null
          visitor_local_label?: string | null
          client_id?: string | null
          review_status?: string
          is_actionable?: boolean
          flags?: string[]
          raw_payload?: Json
          request_id?: string | null
          created_at?: string
          updated_at?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concierge_briefs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_briefs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_categories: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          icon: string | null
          sort_order: number | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          icon?: string | null
          sort_order?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          description?: string | null
          icon?: string | null
          sort_order?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      content_library: {
        Row: {
          id: string
          category_id: string | null
          name: string
          slug: string
          short_description: string | null
          location: string | null
          duration: string | null
          tags: string[] | null
          metadata: Json | null
          is_active: boolean | null
          created_by: string | null
          updated_by: string | null
          created_at: string | null
          updated_at: string | null
          duration_days: number | null
          route: string | null
          is_cruise: boolean | null
          start_city: string | null
          end_city: string | null
          tour_type: string | null
          destination_id: string | null
        }
        Insert: {
          id?: string
          category_id?: string | null
          name: string
          slug: string
          short_description?: string | null
          location?: string | null
          duration?: string | null
          tags?: string[] | null
          metadata?: Json | null
          is_active?: boolean | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          duration_days?: number | null
          route?: string | null
          is_cruise?: boolean | null
          start_city?: string | null
          end_city?: string | null
          tour_type?: string | null
          destination_id?: string | null
        }
        Update: {
          id?: string
          category_id?: string | null
          name?: string
          slug?: string
          short_description?: string | null
          location?: string | null
          duration?: string | null
          tags?: string[] | null
          metadata?: Json | null
          is_active?: boolean | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          duration_days?: number | null
          route?: string | null
          is_cruise?: boolean | null
          start_city?: string | null
          end_city?: string | null
          tour_type?: string | null
          destination_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_library_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "content_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_library_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_library_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_library_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_usage_log: {
        Row: {
          id: string
          content_id: string | null
          variation_id: string | null
          itinerary_id: string | null
          used_at: string | null
          context: string | null
        }
        Insert: {
          id?: string
          content_id?: string | null
          variation_id?: string | null
          itinerary_id?: string | null
          used_at?: string | null
          context?: string | null
        }
        Update: {
          id?: string
          content_id?: string | null
          variation_id?: string | null
          itinerary_id?: string | null
          used_at?: string | null
          context?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_usage_log_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_usage_log_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "content_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_variations: {
        Row: {
          id: string
          content_id: string | null
          tier: string
          title: string | null
          description: string
          highlights: string[] | null
          inclusions: string[] | null
          internal_notes: string | null
          is_active: boolean | null
          created_by: string | null
          updated_by: string | null
          created_at: string | null
          updated_at: string | null
          day_by_day: Json | null
          recommended_suppliers: Json | null
        }
        Insert: {
          id?: string
          content_id?: string | null
          tier: string
          title?: string | null
          description: string
          highlights?: string[] | null
          inclusions?: string[] | null
          internal_notes?: string | null
          is_active?: boolean | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          day_by_day?: Json | null
          recommended_suppliers?: Json | null
        }
        Update: {
          id?: string
          content_id?: string | null
          tier?: string
          title?: string | null
          description?: string
          highlights?: string[] | null
          inclusions?: string[] | null
          internal_notes?: string | null
          is_active?: boolean | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          day_by_day?: Json | null
          recommended_suppliers?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "content_variations_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_variations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_variations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_activity: {
        Row: {
          id: string
          conversation_id: string
          agent_id: string | null
          action_type: string
          action_details: Json | null
          created_at: string | null
          team_member_id: string | null
        }
        Insert: {
          id?: string
          conversation_id: string
          agent_id?: string | null
          action_type: string
          action_details?: Json | null
          created_at?: string | null
          team_member_id?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string
          agent_id?: string | null
          action_type?: string
          action_details?: Json | null
          created_at?: string | null
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_activity_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "sales_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_activity_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_notes: {
        Row: {
          id: string
          conversation_id: string
          agent_id: string | null
          note: string
          is_pinned: boolean | null
          created_at: string | null
          updated_at: string | null
          team_member_id: string | null
        }
        Insert: {
          id?: string
          conversation_id: string
          agent_id?: string | null
          note: string
          is_pinned?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          team_member_id?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string
          agent_id?: string | null
          note?: string
          is_pinned?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "sales_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_knowledge: {
        Row: {
          id: string
          org_id: string
          source_type: string
          source_whatsapp_message_id: string | null
          metadata: Json
          title: string | null
          query_text: string
          answer_text: string
          parent_id: string | null
          chunk_index: number
          embedding: string | null
          embedding_model: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          source_type: string
          source_whatsapp_message_id?: string | null
          metadata: Json
          title?: string | null
          query_text: string
          answer_text: string
          parent_id?: string | null
          chunk_index?: number
          embedding?: string | null
          embedding_model?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          source_type?: string
          source_whatsapp_message_id?: string | null
          metadata?: Json
          title?: string | null
          query_text?: string
          answer_text?: string
          parent_id?: string | null
          chunk_index?: number
          embedding?: string | null
          embedding_model?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_knowledge_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_knowledge_source_whatsapp_message_id_fkey"
            columns: ["source_whatsapp_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_knowledge_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "copilot_knowledge"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_settings: {
        Row: {
          id: string
          user_id: string
          tone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tone?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tone?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      cron_locks: {
        Row: {
          job: string
          slot: string
          updated_at: string
        }
        Insert: {
          job: string
          slot: string
          updated_at?: string
        }
        Update: {
          job?: string
          slot?: string
          updated_at?: string
        }
        Relationships: []
      }
      cron_watermarks: {
        Row: {
          job: string
          last_run_at: string
          updated_at: string
        }
        Insert: {
          job: string
          last_run_at: string
          updated_at?: string
        }
        Update: {
          job?: string
          last_run_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      cruise_contacts: {
        Row: {
          id: string
          name: string
          ship_name: string | null
          cruise_type: string | null
          star_rating: string | null
          route: string | null
          cabin_count: number | null
          contact_person: string | null
          email: string | null
          phone: string | null
          whatsapp: string | null
          address: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          tier: string | null
          is_preferred: boolean | null
          routes: string[] | null
        }
        Insert: {
          id?: string
          name: string
          ship_name?: string | null
          cruise_type?: string | null
          star_rating?: string | null
          route?: string | null
          cabin_count?: number | null
          contact_person?: string | null
          email?: string | null
          phone?: string | null
          whatsapp?: string | null
          address?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          routes?: string[] | null
        }
        Update: {
          id?: string
          name?: string
          ship_name?: string | null
          cruise_type?: string | null
          star_rating?: string | null
          route?: string | null
          cabin_count?: number | null
          contact_person?: string | null
          email?: string | null
          phone?: string | null
          whatsapp?: string | null
          address?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          routes?: string[] | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          id: string
          name: string
          description: string | null
          service_types: string[] | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          service_types?: string[] | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          service_types?: string[] | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      departure_bookings: {
        Row: {
          id: string
          org_id: string
          departure_id: string
          itinerary_id: string | null
          client_id: string | null
          client_name: string | null
          pax: number
          status: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          departure_id: string
          itinerary_id?: string | null
          client_id?: string | null
          client_name?: string | null
          pax?: number
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          departure_id?: string
          itinerary_id?: string | null
          client_id?: string | null
          client_name?: string | null
          pax?: number
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departure_bookings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departure_bookings_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "tour_departures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departure_bookings_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departure_bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      destination_cities: {
        Row: {
          id: string
          destination_id: string
          name: string
          name_ja: string | null
          aliases: string[]
          lat: number | null
          lng: number | null
          airport_codes: string[]
          timezone: string | null
          is_active: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          destination_id: string
          name: string
          name_ja?: string | null
          aliases: string[]
          lat?: number | null
          lng?: number | null
          airport_codes: string[]
          timezone?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          destination_id?: string
          name?: string
          name_ja?: string | null
          aliases?: string[]
          lat?: number | null
          lng?: number | null
          airport_codes?: string[]
          timezone?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "destination_cities_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      destinations: {
        Row: {
          id: string
          country_code: string
          name: string
          name_ja: string | null
          is_active: boolean
          is_default: boolean
          generation_brief: string | null
          glossary: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          country_code: string
          name: string
          name_ja?: string | null
          is_active?: boolean
          is_default?: boolean
          generation_brief?: string | null
          glossary?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          country_code?: string
          name?: string
          name_ja?: string | null
          is_active?: boolean
          is_default?: boolean
          generation_brief?: string | null
          glossary?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      destinations_legacy_2025: {
        Row: {
          id: string
          destination_code: string
          destination_name: string
          region: string | null
          description: string | null
          popular_attractions: string[] | null
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          destination_code: string
          destination_name: string
          region?: string | null
          description?: string | null
          popular_attractions?: string[] | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          destination_code?: string
          destination_name?: string
          region?: string | null
          description?: string | null
          popular_attractions?: string[] | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      discount_rules: {
        Row: {
          id: string
          rule_type: string
          max_age: number | null
          discount_percentage: number
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          rule_type: string
          max_age?: number | null
          discount_percentage: number
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          rule_type?: string
          max_age?: number | null
          discount_percentage?: number
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      email_activity_log: {
        Row: {
          id: string
          user_id: string
          client_id: string | null
          message_id: string | null
          thread_id: string | null
          activity_type: string
          subject: string | null
          from_email: string | null
          to_email: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          client_id?: string | null
          message_id?: string | null
          thread_id?: string | null
          activity_type: string
          subject?: string | null
          from_email?: string | null
          to_email?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string | null
          message_id?: string | null
          thread_id?: string | null
          activity_type?: string
          subject?: string | null
          from_email?: string | null
          to_email?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_cache_metadata: {
        Row: {
          id: string
          user_id: string
          folder: string
          history_id: string | null
          last_fetch: string | null
          email_count: number | null
        }
        Insert: {
          id?: string
          user_id: string
          folder: string
          history_id?: string | null
          last_fetch?: string | null
          email_count?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          folder?: string
          history_id?: string | null
          last_fetch?: string | null
          email_count?: number | null
        }
        Relationships: []
      }
      email_client_links: {
        Row: {
          id: string
          user_id: string
          message_id: string
          thread_id: string | null
          client_id: string | null
          email_address: string | null
          auto_linked: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          message_id: string
          thread_id?: string | null
          client_id?: string | null
          email_address?: string | null
          auto_linked?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          message_id?: string
          thread_id?: string | null
          client_id?: string | null
          email_address?: string | null
          auto_linked?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_client_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_conversations: {
        Row: {
          id: string
          thread_id: string
          user_id: string | null
          client_id: string | null
          client_name: string | null
          client_email: string | null
          subject: string | null
          last_message_snippet: string | null
          last_message_at: string | null
          message_count: number | null
          unread_count: number | null
          status: string | null
          is_starred: boolean | null
          is_hidden: boolean | null
          assigned_team_member_id: string | null
          assigned_at: string | null
          last_sync_at: string | null
          gmail_history_id: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          thread_id: string
          user_id?: string | null
          client_id?: string | null
          client_name?: string | null
          client_email?: string | null
          subject?: string | null
          last_message_snippet?: string | null
          last_message_at?: string | null
          message_count?: number | null
          unread_count?: number | null
          status?: string | null
          is_starred?: boolean | null
          is_hidden?: boolean | null
          assigned_team_member_id?: string | null
          assigned_at?: string | null
          last_sync_at?: string | null
          gmail_history_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          thread_id?: string
          user_id?: string | null
          client_id?: string | null
          client_name?: string | null
          client_email?: string | null
          subject?: string | null
          last_message_snippet?: string | null
          last_message_at?: string | null
          message_count?: number | null
          unread_count?: number | null
          status?: string | null
          is_starred?: boolean | null
          is_hidden?: boolean | null
          assigned_team_member_id?: string | null
          assigned_at?: string | null
          last_sync_at?: string | null
          gmail_history_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_conversations_assigned_team_member_id_fkey"
            columns: ["assigned_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          id: string
          conversation_id: string | null
          message_id: string
          thread_id: string
          direction: string
          from_address: string
          to_addresses: string[] | null
          cc_addresses: string[] | null
          bcc_addresses: string[] | null
          subject: string | null
          body_text: string | null
          body_html: string | null
          snippet: string | null
          attachments: Json | null
          is_read: boolean | null
          is_starred: boolean | null
          labels: string[] | null
          sent_at: string
          received_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          conversation_id?: string | null
          message_id: string
          thread_id: string
          direction: string
          from_address: string
          to_addresses?: string[] | null
          cc_addresses?: string[] | null
          bcc_addresses?: string[] | null
          subject?: string | null
          body_text?: string | null
          body_html?: string | null
          snippet?: string | null
          attachments?: Json | null
          is_read?: boolean | null
          is_starred?: boolean | null
          labels?: string[] | null
          sent_at: string
          received_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string | null
          message_id?: string
          thread_id?: string
          direction?: string
          from_address?: string
          to_addresses?: string[] | null
          cc_addresses?: string[] | null
          bcc_addresses?: string[] | null
          subject?: string | null
          body_text?: string | null
          body_html?: string | null
          snippet?: string | null
          attachments?: Json | null
          is_read?: boolean | null
          is_starred?: boolean | null
          labels?: string[] | null
          sent_at?: string
          received_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "email_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_signatures: {
        Row: {
          id: string
          user_id: string | null
          name: string
          content: string
          is_default: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          content: string
          is_default?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string
          content?: string
          is_default?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_sync_state: {
        Row: {
          id: string
          user_id: string | null
          last_history_id: string | null
          last_full_sync_at: string | null
          last_incremental_sync_at: string | null
          sync_status: string | null
          error_message: string | null
          emails_synced: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          last_history_id?: string | null
          last_full_sync_at?: string | null
          last_incremental_sync_at?: string | null
          sync_status?: string | null
          error_message?: string | null
          emails_synced?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          last_history_id?: string | null
          last_full_sync_at?: string | null
          last_incremental_sync_at?: string | null
          sync_status?: string | null
          error_message?: string | null
          emails_synced?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          id: string
          user_id: string | null
          name: string
          subject: string
          content: string
          category: string | null
          created_at: string | null
          updated_at: string | null
          placeholders: string[] | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          subject: string
          content: string
          category?: string | null
          created_at?: string | null
          updated_at?: string | null
          placeholders?: string[] | null
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string
          subject?: string
          content?: string
          category?: string | null
          created_at?: string | null
          updated_at?: string | null
          placeholders?: string[] | null
        }
        Relationships: []
      }
      entrance_fee_versions: {
        Row: {
          id: string
          entrance_fee_id: string
          language: string
          attraction_name: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          entrance_fee_id: string
          language: string
          attraction_name?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          entrance_fee_id?: string
          language?: string
          attraction_name?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entrance_fee_versions_entrance_fee_id_fkey"
            columns: ["entrance_fee_id"]
            isOneToOne: false
            referencedRelation: "entrance_fees"
            referencedColumns: ["id"]
          },
        ]
      }
      entrance_fees: {
        Row: {
          id: string
          service_code: string
          attraction_name: string
          city: string
          fee_type: string | null
          eur_rate: number
          non_eur_rate: number
          egyptian_rate: number | null
          student_discount_percentage: number | null
          season: string | null
          rate_valid_from: string
          rate_valid_to: string
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          child_discount_percent: number | null
          category: string | null
          supplier_id: string | null
          is_addon: boolean | null
          addon_note: string | null
          rate_currency: string | null
          is_sellable_extra: boolean
        }
        Insert: {
          id?: string
          service_code: string
          attraction_name: string
          city: string
          fee_type?: string | null
          eur_rate: number
          non_eur_rate: number
          egyptian_rate?: number | null
          student_discount_percentage?: number | null
          season?: string | null
          rate_valid_from: string
          rate_valid_to: string
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          child_discount_percent?: number | null
          category?: string | null
          supplier_id?: string | null
          is_addon?: boolean | null
          addon_note?: string | null
          rate_currency?: string | null
          is_sellable_extra?: boolean
        }
        Update: {
          id?: string
          service_code?: string
          attraction_name?: string
          city?: string
          fee_type?: string | null
          eur_rate?: number
          non_eur_rate?: number
          egyptian_rate?: number | null
          student_discount_percentage?: number | null
          season?: string | null
          rate_valid_from?: string
          rate_valid_to?: string
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          child_discount_percent?: number | null
          category?: string | null
          supplier_id?: string | null
          is_addon?: boolean | null
          addon_note?: string | null
          rate_currency?: string | null
          is_sellable_extra?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "entrance_fees_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rate_snapshots: {
        Row: {
          id: string
          base_currency: string
          target_currency: string
          rate: number
          source: string | null
          captured_at: string
        }
        Insert: {
          id?: string
          base_currency: string
          target_currency: string
          rate: number
          source?: string | null
          captured_at?: string
        }
        Update: {
          id?: string
          base_currency?: string
          target_currency?: string
          rate?: number
          source?: string | null
          captured_at?: string
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          id: string
          base_currency: string
          target_currency: string
          rate: number
          source: string
          is_active: boolean
          api_fetched_at: string | null
          last_updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          base_currency: string
          target_currency: string
          rate: number
          source?: string
          is_active?: boolean
          api_fetched_at?: string | null
          last_updated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          base_currency?: string
          target_currency?: string
          rate?: number
          source?: string
          is_active?: boolean
          api_fetched_at?: string | null
          last_updated_at?: string
          created_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          id: string
          expense_number: string | null
          itinerary_id: string | null
          supplier_id: string | null
          category: string
          description: string | null
          amount: number
          currency: string | null
          expense_date: string
          supplier_name: string | null
          supplier_type: string | null
          receipt_url: string | null
          receipt_filename: string | null
          status: string | null
          payment_method: string | null
          payment_date: string | null
          payment_reference: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          tax_rate: number | null
          tax_amount: number | null
          tax_included: boolean | null
          org_id: string
        }
        Insert: {
          id?: string
          expense_number?: string | null
          itinerary_id?: string | null
          supplier_id?: string | null
          category: string
          description?: string | null
          amount: number
          currency?: string | null
          expense_date: string
          supplier_name?: string | null
          supplier_type?: string | null
          receipt_url?: string | null
          receipt_filename?: string | null
          status?: string | null
          payment_method?: string | null
          payment_date?: string | null
          payment_reference?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          tax_rate?: number | null
          tax_amount?: number | null
          tax_included?: boolean | null
          org_id: string
        }
        Update: {
          id?: string
          expense_number?: string | null
          itinerary_id?: string | null
          supplier_id?: string | null
          category?: string
          description?: string | null
          amount?: number
          currency?: string | null
          expense_date?: string
          supplier_name?: string | null
          supplier_type?: string | null
          receipt_url?: string | null
          receipt_filename?: string | null
          status?: string | null
          payment_method?: string | null
          payment_date?: string | null
          payment_reference?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          tax_rate?: number | null
          tax_amount?: number | null
          tax_included?: boolean | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      extras_catalogue: {
        Row: {
          id: string
          org_id: string
          name: string
          description: string | null
          category: string | null
          supplier_cost: number | null
          supplier_id: string | null
          selling_price: number | null
          unit: string
          is_active: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          description?: string | null
          category?: string | null
          supplier_cost?: number | null
          supplier_id?: string | null
          selling_price?: number | null
          unit?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          description?: string | null
          category?: string | null
          supplier_cost?: number | null
          supplier_id?: string | null
          selling_price?: number | null
          unit?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extras_catalogue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_catalogue_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_daily_costs: {
        Row: {
          id: string
          cost_type: string
          cost_per_person_per_day: number
          is_active: boolean | null
          created_at: string | null
          description: string | null
          rate_currency: string | null
        }
        Insert: {
          id?: string
          cost_type: string
          cost_per_person_per_day: number
          is_active?: boolean | null
          created_at?: string | null
          description?: string | null
          rate_currency?: string | null
        }
        Update: {
          id?: string
          cost_type?: string
          cost_per_person_per_day?: number
          is_active?: boolean | null
          created_at?: string | null
          description?: string | null
          rate_currency?: string | null
        }
        Relationships: []
      }
      flight_rates: {
        Row: {
          id: string
          service_code: string
          route_from: string
          route_to: string
          route_name: string | null
          airline: string
          airline_code: string | null
          flight_number: string | null
          flight_type: string
          cabin_class: string
          departure_time: string | null
          arrival_time: string | null
          duration_minutes: number | null
          frequency: string | null
          base_rate_eur: number
          base_rate_non_eur: number | null
          tax_eur: number | null
          tax_non_eur: number | null
          baggage_kg: number | null
          carry_on_kg: number | null
          season: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          supplier_id: string | null
          supplier_name: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          rate_currency: string | null
        }
        Insert: {
          id?: string
          service_code: string
          route_from: string
          route_to: string
          route_name?: string | null
          airline: string
          airline_code?: string | null
          flight_number?: string | null
          flight_type?: string
          cabin_class?: string
          departure_time?: string | null
          arrival_time?: string | null
          duration_minutes?: number | null
          frequency?: string | null
          base_rate_eur?: number
          base_rate_non_eur?: number | null
          tax_eur?: number | null
          tax_non_eur?: number | null
          baggage_kg?: number | null
          carry_on_kg?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          rate_currency?: string | null
        }
        Update: {
          id?: string
          service_code?: string
          route_from?: string
          route_to?: string
          route_name?: string | null
          airline?: string
          airline_code?: string | null
          flight_number?: string | null
          flight_type?: string
          cabin_class?: string
          departure_time?: string | null
          arrival_time?: string | null
          duration_minutes?: number | null
          frequency?: string | null
          base_rate_eur?: number
          base_rate_non_eur?: number | null
          tax_eur?: number | null
          tax_non_eur?: number | null
          baggage_kg?: number | null
          carry_on_kg?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          rate_currency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_tokens: {
        Row: {
          id: string
          user_id: string | null
          email: string
          access_token: string
          refresh_token: string
          token_expiry: string
          created_at: string | null
          updated_at: string | null
          last_history_id: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          email: string
          access_token: string
          refresh_token: string
          token_expiry: string
          created_at?: string | null
          updated_at?: string | null
          last_history_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          email?: string
          access_token?: string
          refresh_token?: string
          token_expiry?: string
          created_at?: string | null
          updated_at?: string | null
          last_history_id?: string | null
        }
        Relationships: []
      }
      guide_rates: {
        Row: {
          id: string
          service_code: string
          guide_language: string
          guide_type: string
          city: string | null
          tour_duration: string | null
          base_rate_eur: number
          base_rate_non_eur: number
          season: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          supplier_id: string | null
          rate_currency: string | null
        }
        Insert: {
          id?: string
          service_code: string
          guide_language: string
          guide_type: string
          city?: string | null
          tour_duration?: string | null
          base_rate_eur: number
          base_rate_non_eur: number
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          supplier_id?: string | null
          rate_currency?: string | null
        }
        Update: {
          id?: string
          service_code?: string
          guide_language?: string
          guide_type?: string
          city?: string | null
          tour_duration?: string | null
          base_rate_eur?: number
          base_rate_non_eur?: number
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          supplier_id?: string | null
          rate_currency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guide_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          id: string | null
          name: string | null
          email: string | null
          phone: string | null
          languages: string[] | null
          specialties: string[] | null
          certification_number: string | null
          license_expiry: string | null
          is_active: boolean | null
          max_group_size: number | null
          hourly_rate: number | null
          daily_rate: number | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          address: string | null
          notes: string | null
          profile_photo_url: string | null
          created_at: string | null
          updated_at: string | null
          tier: string | null
          is_preferred: boolean | null
          city: string | null
          whatsapp: string | null
        }
        Insert: {
          id?: string | null
          name?: string | null
          email?: string | null
          phone?: string | null
          languages?: string[] | null
          specialties?: string[] | null
          certification_number?: string | null
          license_expiry?: string | null
          is_active?: boolean | null
          max_group_size?: number | null
          hourly_rate?: number | null
          daily_rate?: number | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          address?: string | null
          notes?: string | null
          profile_photo_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          city?: string | null
          whatsapp?: string | null
        }
        Update: {
          id?: string | null
          name?: string | null
          email?: string | null
          phone?: string | null
          languages?: string[] | null
          specialties?: string[] | null
          certification_number?: string | null
          license_expiry?: string | null
          is_active?: boolean | null
          max_group_size?: number | null
          hourly_rate?: number | null
          daily_rate?: number | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          address?: string | null
          notes?: string | null
          profile_photo_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          city?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      high_value_clients: {
        Row: {
          id: string | null
          client_code: string | null
          first_name: string | null
          last_name: string | null
          email: string | null
          phone: string | null
          alternative_phone: string | null
          nationality: string | null
          passport_type: string | null
          date_of_birth: string | null
          preferred_language: string | null
          country: string | null
          city: string | null
          address_line1: string | null
          address_line2: string | null
          postal_code: string | null
          preferred_contact_method: string | null
          best_time_to_contact: string | null
          timezone: string | null
          preferred_accommodation_level: string | null
          dietary_restrictions: string[] | null
          accessibility_needs: string[] | null
          special_interests: string[] | null
          company_name: string | null
          job_title: string | null
          is_travel_agent: boolean | null
          agent_commission_rate: number | null
          client_type: string | null
          vip_status: boolean | null
          client_source: string | null
          referred_by_client_id: string | null
          marketing_consent: boolean | null
          newsletter_subscribed: boolean | null
          sms_consent: boolean | null
          total_bookings_count: number | null
          total_revenue_generated: number | null
          currency_preference: string | null
          average_booking_value: number | null
          status: string | null
          tags: string[] | null
          rating: number | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          last_contacted_at: string | null
          internal_notes: string | null
          revenue_rank: number | null
        }
        Insert: {
          id?: string | null
          client_code?: string | null
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone?: string | null
          alternative_phone?: string | null
          nationality?: string | null
          passport_type?: string | null
          date_of_birth?: string | null
          preferred_language?: string | null
          country?: string | null
          city?: string | null
          address_line1?: string | null
          address_line2?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          best_time_to_contact?: string | null
          timezone?: string | null
          preferred_accommodation_level?: string | null
          dietary_restrictions?: string[] | null
          accessibility_needs?: string[] | null
          special_interests?: string[] | null
          company_name?: string | null
          job_title?: string | null
          is_travel_agent?: boolean | null
          agent_commission_rate?: number | null
          client_type?: string | null
          vip_status?: boolean | null
          client_source?: string | null
          referred_by_client_id?: string | null
          marketing_consent?: boolean | null
          newsletter_subscribed?: boolean | null
          sms_consent?: boolean | null
          total_bookings_count?: number | null
          total_revenue_generated?: number | null
          currency_preference?: string | null
          average_booking_value?: number | null
          status?: string | null
          tags?: string[] | null
          rating?: number | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          last_contacted_at?: string | null
          internal_notes?: string | null
          revenue_rank?: number | null
        }
        Update: {
          id?: string | null
          client_code?: string | null
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone?: string | null
          alternative_phone?: string | null
          nationality?: string | null
          passport_type?: string | null
          date_of_birth?: string | null
          preferred_language?: string | null
          country?: string | null
          city?: string | null
          address_line1?: string | null
          address_line2?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          best_time_to_contact?: string | null
          timezone?: string | null
          preferred_accommodation_level?: string | null
          dietary_restrictions?: string[] | null
          accessibility_needs?: string[] | null
          special_interests?: string[] | null
          company_name?: string | null
          job_title?: string | null
          is_travel_agent?: boolean | null
          agent_commission_rate?: number | null
          client_type?: string | null
          vip_status?: boolean | null
          client_source?: string | null
          referred_by_client_id?: string | null
          marketing_consent?: boolean | null
          newsletter_subscribed?: boolean | null
          sms_consent?: boolean | null
          total_bookings_count?: number | null
          total_revenue_generated?: number | null
          currency_preference?: string | null
          average_booking_value?: number | null
          status?: string | null
          tags?: string[] | null
          rating?: number | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          last_contacted_at?: string | null
          internal_notes?: string | null
          revenue_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "high_value_clients_referred_by_client_id_fkey"
            columns: ["referred_by_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_contacts: {
        Row: {
          id: string
          name: string
          property_type: string | null
          star_rating: number | null
          city: string
          address: string | null
          contact_person: string | null
          phone: string | null
          email: string | null
          whatsapp: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          amenities: string[] | null
          capacity: number | null
          rate_single_eur: number | null
          rate_double_eur: number | null
          rate_triple_eur: number | null
          rate_single_non_eur: number | null
          rate_double_non_eur: number | null
          rate_triple_non_eur: number | null
          rate_suite_eur: number | null
          rate_suite_non_eur: number | null
          high_season_markup_percent: number | null
          peak_season_markup_percent: number | null
          breakfast_included: boolean | null
          breakfast_rate_eur: number | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          meal_plan: string | null
          child_policy: string | null
          tier: string | null
          is_preferred: boolean | null
          low_season_from: string | null
          low_season_to: string | null
          high_season_from: string | null
          high_season_to: string | null
          peak_season_from: string | null
          peak_season_to: string | null
          peak_season_2_from: string | null
          peak_season_2_to: string | null
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          reservations_email: string | null
          reservations_phone: string | null
        }
        Insert: {
          id?: string
          name: string
          property_type?: string | null
          star_rating?: number | null
          city: string
          address?: string | null
          contact_person?: string | null
          phone?: string | null
          email?: string | null
          whatsapp?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          amenities?: string[] | null
          capacity?: number | null
          rate_single_eur?: number | null
          rate_double_eur?: number | null
          rate_triple_eur?: number | null
          rate_single_non_eur?: number | null
          rate_double_non_eur?: number | null
          rate_triple_non_eur?: number | null
          rate_suite_eur?: number | null
          rate_suite_non_eur?: number | null
          high_season_markup_percent?: number | null
          peak_season_markup_percent?: number | null
          breakfast_included?: boolean | null
          breakfast_rate_eur?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          meal_plan?: string | null
          child_policy?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          low_season_from?: string | null
          low_season_to?: string | null
          high_season_from?: string | null
          high_season_to?: string | null
          peak_season_from?: string | null
          peak_season_to?: string | null
          peak_season_2_from?: string | null
          peak_season_2_to?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          reservations_email?: string | null
          reservations_phone?: string | null
        }
        Update: {
          id?: string
          name?: string
          property_type?: string | null
          star_rating?: number | null
          city?: string
          address?: string | null
          contact_person?: string | null
          phone?: string | null
          email?: string | null
          whatsapp?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          amenities?: string[] | null
          capacity?: number | null
          rate_single_eur?: number | null
          rate_double_eur?: number | null
          rate_triple_eur?: number | null
          rate_single_non_eur?: number | null
          rate_double_non_eur?: number | null
          rate_triple_non_eur?: number | null
          rate_suite_eur?: number | null
          rate_suite_non_eur?: number | null
          high_season_markup_percent?: number | null
          peak_season_markup_percent?: number | null
          breakfast_included?: boolean | null
          breakfast_rate_eur?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          meal_plan?: string | null
          child_policy?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          low_season_from?: string | null
          low_season_to?: string | null
          high_season_from?: string | null
          high_season_to?: string | null
          peak_season_from?: string | null
          peak_season_to?: string | null
          peak_season_2_from?: string | null
          peak_season_2_to?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          reservations_email?: string | null
          reservations_phone?: string | null
        }
        Relationships: []
      }
      hotel_staff: {
        Row: {
          id: string | null
          name: string | null
          role: string | null
          phone: string | null
          whatsapp: string | null
          email: string | null
          languages: string[] | null
          shift_times: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          emergency_contact: string | null
          tier: string | null
          is_preferred: boolean | null
        }
        Insert: {
          id?: string | null
          name?: string | null
          role?: string | null
          phone?: string | null
          whatsapp?: string | null
          email?: string | null
          languages?: string[] | null
          shift_times?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          emergency_contact?: string | null
          tier?: string | null
          is_preferred?: boolean | null
        }
        Update: {
          id?: string | null
          name?: string | null
          role?: string | null
          phone?: string | null
          whatsapp?: string | null
          email?: string | null
          languages?: string[] | null
          shift_times?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          emergency_contact?: string | null
          tier?: string | null
          is_preferred?: boolean | null
        }
        Relationships: []
      }
      hotel_staff_rates: {
        Row: {
          id: string
          service_code: string
          service_type: string
          hotel_category: string | null
          rate_eur: number | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          is_active: boolean | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          description: string | null
          destination: string | null
          supplier_id: string | null
          rate_currency: string | null
        }
        Insert: {
          id?: string
          service_code: string
          service_type: string
          hotel_category?: string | null
          rate_eur?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          destination?: string | null
          supplier_id?: string | null
          rate_currency?: string | null
        }
        Update: {
          id?: string
          service_code?: string
          service_type?: string
          hotel_category?: string | null
          rate_eur?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          destination?: string | null
          supplier_id?: string | null
          rate_currency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_staff_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_plans: {
        Row: {
          id: string
          org_id: string
          plan_code: string
          provider: string
          product_name: string
          cover_accidental_death: number | null
          cover_illness_death: number | null
          cover_treatment_rescue: number | null
          cover_liability: number | null
          cover_baggage: number | null
          cover_baggage_delay: number | null
          cover_flight_delay: number | null
          display_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          plan_code: string
          provider?: string
          product_name?: string
          cover_accidental_death?: number | null
          cover_illness_death?: number | null
          cover_treatment_rescue?: number | null
          cover_liability?: number | null
          cover_baggage?: number | null
          cover_baggage_delay?: number | null
          cover_flight_delay?: number | null
          display_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          plan_code?: string
          provider?: string
          product_name?: string
          cover_accidental_death?: number | null
          cover_illness_death?: number | null
          cover_treatment_rescue?: number | null
          cover_liability?: number | null
          cover_baggage?: number | null
          cover_baggage_delay?: number | null
          cover_flight_delay?: number | null
          display_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_premiums: {
        Row: {
          id: string
          org_id: string
          plan_id: string
          rate_year: number
          max_days: number
          band_label: string
          premium_jpy: number
          max_age: number | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          plan_id: string
          rate_year: number
          max_days: number
          band_label: string
          premium_jpy: number
          max_age?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          plan_id?: string
          rate_year?: number
          max_days?: number
          band_label?: string
          premium_jpy?: number
          max_age?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_premiums_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_premiums_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "insurance_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          id: string
          org_id: string
          integration_id: string
          direction: string
          event_type: string
          external_event_id: string | null
          status: string
          payload: Json | null
          result: Json | null
          error: string | null
          received_at: string
          processed_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          integration_id: string
          direction: string
          event_type?: string
          external_event_id?: string | null
          status?: string
          payload?: Json | null
          result?: Json | null
          error?: string | null
          received_at?: string
          processed_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          integration_id?: string
          direction?: string
          event_type?: string
          external_event_id?: string | null
          status?: string
          payload?: Json | null
          result?: Json | null
          error?: string | null
          received_at?: string
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          id: string
          org_id: string
          provider: string
          name: string
          endpoint_token: string | null
          direction: string
          is_active: boolean
          inbound_secret: string | null
          outbound_key_hash: string | null
          outbound_key_prefix: string | null
          outbound_key_issued_at: string | null
          settings: Json
          last_inbound_at: string | null
          last_outbound_at: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          org_id: string
          provider?: string
          name: string
          endpoint_token?: string | null
          direction?: string
          is_active?: boolean
          inbound_secret?: string | null
          outbound_key_hash?: string | null
          outbound_key_prefix?: string | null
          outbound_key_issued_at?: string | null
          settings: Json
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          provider?: string
          name?: string
          endpoint_token?: string | null
          direction?: string
          is_active?: boolean
          inbound_secret?: string | null
          outbound_key_hash?: string | null
          outbound_key_prefix?: string | null
          outbound_key_issued_at?: string | null
          settings?: Json
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          id: string
          invoice_id: string | null
          amount: number
          currency: string | null
          payment_method: string | null
          payment_date: string | null
          transaction_reference: string | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          invoice_id?: string | null
          amount: number
          currency?: string | null
          payment_method?: string | null
          payment_date?: string | null
          transaction_reference?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          invoice_id?: string | null
          amount?: number
          currency?: string | null
          payment_method?: string | null
          payment_date?: string | null
          transaction_reference?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          id: string
          invoice_id: string
          sent_at: string
          reminder_type: string
          recipient_email: string
          subject: string | null
          status: string | null
          error_message: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          invoice_id: string
          sent_at?: string
          reminder_type: string
          recipient_email: string
          subject?: string | null
          status?: string | null
          error_message?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          invoice_id?: string
          sent_at?: string
          reminder_type?: string
          recipient_email?: string
          subject?: string | null
          status?: string | null
          error_message?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          id: string
          invoice_number: string
          client_id: string | null
          itinerary_id: string | null
          client_name: string | null
          client_email: string | null
          line_items: Json | null
          subtotal: number | null
          tax_rate: number | null
          tax_amount: number | null
          discount_amount: number | null
          total_amount: number | null
          currency: string | null
          amount_paid: number | null
          balance_due: number | null
          status: string | null
          issue_date: string | null
          due_date: string | null
          notes: string | null
          payment_terms: string | null
          payment_instructions: string | null
          created_at: string | null
          updated_at: string | null
          sent_at: string | null
          paid_at: string | null
          last_reminder_sent: string | null
          reminder_count: number | null
          next_reminder_date: string | null
          reminder_paused: boolean | null
          invoice_type: string | null
          deposit_percent: number | null
          parent_invoice_id: string | null
          org_id: string
          full_trip_cost: number | null
        }
        Insert: {
          id?: string
          invoice_number: string
          client_id?: string | null
          itinerary_id?: string | null
          client_name?: string | null
          client_email?: string | null
          line_items?: Json | null
          subtotal?: number | null
          tax_rate?: number | null
          tax_amount?: number | null
          discount_amount?: number | null
          total_amount?: number | null
          currency?: string | null
          amount_paid?: number | null
          balance_due?: number | null
          status?: string | null
          issue_date?: string | null
          due_date?: string | null
          notes?: string | null
          payment_terms?: string | null
          payment_instructions?: string | null
          created_at?: string | null
          updated_at?: string | null
          sent_at?: string | null
          paid_at?: string | null
          last_reminder_sent?: string | null
          reminder_count?: number | null
          next_reminder_date?: string | null
          reminder_paused?: boolean | null
          invoice_type?: string | null
          deposit_percent?: number | null
          parent_invoice_id?: string | null
          org_id: string
          full_trip_cost?: number | null
        }
        Update: {
          id?: string
          invoice_number?: string
          client_id?: string | null
          itinerary_id?: string | null
          client_name?: string | null
          client_email?: string | null
          line_items?: Json | null
          subtotal?: number | null
          tax_rate?: number | null
          tax_amount?: number | null
          discount_amount?: number | null
          total_amount?: number | null
          currency?: string | null
          amount_paid?: number | null
          balance_due?: number | null
          status?: string | null
          issue_date?: string | null
          due_date?: string | null
          notes?: string | null
          payment_terms?: string | null
          payment_instructions?: string | null
          created_at?: string | null
          updated_at?: string | null
          sent_at?: string | null
          paid_at?: string | null
          last_reminder_sent?: string | null
          reminder_count?: number | null
          next_reminder_date?: string | null
          reminder_paused?: boolean | null
          invoice_type?: string | null
          deposit_percent?: number | null
          parent_invoice_id?: string | null
          org_id?: string
          full_trip_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      itineraries: {
        Row: {
          id: string
          itinerary_code: string
          client_name: string
          client_email: string | null
          client_phone: string | null
          trip_name: string
          start_date: string
          end_date: string
          total_days: number
          num_adults: number | null
          num_children: number | null
          currency: string | null
          total_cost: number | null
          status: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          cancelled_at: string | null
          cancellation_reason: string | null
          user_id: string | null
          client_id: string | null
          payment_status: string | null
          total_paid: number | null
          deposit_amount: number | null
          balance_due: number | null
          assigned_guide_id: string | null
          assigned_vehicle_id: string | null
          guide_notes: string | null
          vehicle_notes: string | null
          pickup_location: string | null
          pickup_time: string | null
          destinations: string | null
          num_travelers: number | null
          assigned_hotel_id: string | null
          assigned_restaurant_id: string | null
          assigned_airport_staff_id: string | null
          assigned_hotel_staff_id: string | null
          hotel_notes: string | null
          restaurant_notes: string | null
          airport_staff_notes: string | null
          hotel_staff_notes: string | null
          total_revenue: number | null
          margin_percent: number | null
          tier: string | null
          cost_mode: string | null
          package_type: "day-trips" | "tours-only" | "land-package" | "full-package" | "cruise-land" | "shore-excursions" | "cruise-package" | null
          supplier_cost: number | null
          profit: number | null
          num_infants: number | null
          partner_id: string | null
          source: string | null
          partner_commission_percent: number | null
          partner_commission_amount: number | null
          cabin_allocation: Json | null
          inclusions: string[] | null
          exclusions: string[] | null
          idempotency_key: string | null
          generation_warnings: Json | null
          org_id: string
          thread_id: string | null
          assigned_to: string | null
          assigned_at: string | null
          template_id: string | null
          fx_frozen: Json | null
          destination_id: string | null
        }
        Insert: {
          id?: string
          itinerary_code: string
          client_name: string
          client_email?: string | null
          client_phone?: string | null
          trip_name: string
          start_date: string
          end_date: string
          total_days: number
          num_adults?: number | null
          num_children?: number | null
          currency?: string | null
          total_cost?: number | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          user_id?: string | null
          client_id?: string | null
          payment_status?: string | null
          total_paid?: number | null
          deposit_amount?: number | null
          balance_due?: number | null
          assigned_guide_id?: string | null
          assigned_vehicle_id?: string | null
          guide_notes?: string | null
          vehicle_notes?: string | null
          pickup_location?: string | null
          pickup_time?: string | null
          destinations?: string | null
          num_travelers?: number | null
          assigned_hotel_id?: string | null
          assigned_restaurant_id?: string | null
          assigned_airport_staff_id?: string | null
          assigned_hotel_staff_id?: string | null
          hotel_notes?: string | null
          restaurant_notes?: string | null
          airport_staff_notes?: string | null
          hotel_staff_notes?: string | null
          total_revenue?: number | null
          margin_percent?: number | null
          tier?: string | null
          cost_mode?: string | null
          package_type?: "day-trips" | "tours-only" | "land-package" | "full-package" | "cruise-land" | "shore-excursions" | "cruise-package" | null
          supplier_cost?: number | null
          profit?: number | null
          num_infants?: number | null
          partner_id?: string | null
          source?: string | null
          partner_commission_percent?: number | null
          partner_commission_amount?: number | null
          cabin_allocation?: Json | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          idempotency_key?: string | null
          generation_warnings?: Json | null
          org_id: string
          thread_id?: string | null
          assigned_to?: string | null
          assigned_at?: string | null
          template_id?: string | null
          fx_frozen?: Json | null
          destination_id?: string | null
        }
        Update: {
          id?: string
          itinerary_code?: string
          client_name?: string
          client_email?: string | null
          client_phone?: string | null
          trip_name?: string
          start_date?: string
          end_date?: string
          total_days?: number
          num_adults?: number | null
          num_children?: number | null
          currency?: string | null
          total_cost?: number | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          user_id?: string | null
          client_id?: string | null
          payment_status?: string | null
          total_paid?: number | null
          deposit_amount?: number | null
          balance_due?: number | null
          assigned_guide_id?: string | null
          assigned_vehicle_id?: string | null
          guide_notes?: string | null
          vehicle_notes?: string | null
          pickup_location?: string | null
          pickup_time?: string | null
          destinations?: string | null
          num_travelers?: number | null
          assigned_hotel_id?: string | null
          assigned_restaurant_id?: string | null
          assigned_airport_staff_id?: string | null
          assigned_hotel_staff_id?: string | null
          hotel_notes?: string | null
          restaurant_notes?: string | null
          airport_staff_notes?: string | null
          hotel_staff_notes?: string | null
          total_revenue?: number | null
          margin_percent?: number | null
          tier?: string | null
          cost_mode?: string | null
          package_type?: "day-trips" | "tours-only" | "land-package" | "full-package" | "cruise-land" | "shore-excursions" | "cruise-package" | null
          supplier_cost?: number | null
          profit?: number | null
          num_infants?: number | null
          partner_id?: string | null
          source?: string | null
          partner_commission_percent?: number | null
          partner_commission_amount?: number | null
          cabin_allocation?: Json | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          idempotency_key?: string | null
          generation_warnings?: Json | null
          org_id?: string
          thread_id?: string | null
          assigned_to?: string | null
          assigned_at?: string | null
          template_id?: string | null
          fx_frozen?: Json | null
          destination_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itineraries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_assigned_guide_id_fkey"
            columns: ["assigned_guide_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_assigned_vehicle_id_fkey"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_assigned_hotel_id_fkey"
            columns: ["assigned_hotel_id"]
            isOneToOne: false
            referencedRelation: "hotel_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_assigned_restaurant_id_fkey"
            columns: ["assigned_restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_assigned_airport_staff_id_fkey"
            columns: ["assigned_airport_staff_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_assigned_hotel_staff_id_fkey"
            columns: ["assigned_hotel_staff_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "b2b_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tour_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      itineraries_with_languages: {
        Row: {
          id: string | null
          itinerary_code: string | null
          client_name: string | null
          client_email: string | null
          client_phone: string | null
          trip_name: string | null
          start_date: string | null
          end_date: string | null
          total_days: number | null
          num_adults: number | null
          num_children: number | null
          currency: string | null
          total_cost: number | null
          status: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          cancelled_at: string | null
          cancellation_reason: string | null
          user_id: string | null
          client_id: string | null
          payment_status: string | null
          total_paid: number | null
          deposit_amount: number | null
          balance_due: number | null
          assigned_guide_id: string | null
          assigned_vehicle_id: string | null
          guide_notes: string | null
          vehicle_notes: string | null
          pickup_location: string | null
          pickup_time: string | null
          destinations: string | null
          num_travelers: number | null
          assigned_hotel_id: string | null
          assigned_restaurant_id: string | null
          assigned_airport_staff_id: string | null
          assigned_hotel_staff_id: string | null
          hotel_notes: string | null
          restaurant_notes: string | null
          airport_staff_notes: string | null
          hotel_staff_notes: string | null
          total_revenue: number | null
          margin_percent: number | null
          tier: string | null
          cost_mode: string | null
          package_type: "day-trips" | "tours-only" | "land-package" | "full-package" | "cruise-land" | "shore-excursions" | "cruise-package" | null
          supplier_cost: number | null
          profit: number | null
          available_languages: string[] | null
          version_count: number | null
        }
        Insert: {
          id?: string | null
          itinerary_code?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          trip_name?: string | null
          start_date?: string | null
          end_date?: string | null
          total_days?: number | null
          num_adults?: number | null
          num_children?: number | null
          currency?: string | null
          total_cost?: number | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          user_id?: string | null
          client_id?: string | null
          payment_status?: string | null
          total_paid?: number | null
          deposit_amount?: number | null
          balance_due?: number | null
          assigned_guide_id?: string | null
          assigned_vehicle_id?: string | null
          guide_notes?: string | null
          vehicle_notes?: string | null
          pickup_location?: string | null
          pickup_time?: string | null
          destinations?: string | null
          num_travelers?: number | null
          assigned_hotel_id?: string | null
          assigned_restaurant_id?: string | null
          assigned_airport_staff_id?: string | null
          assigned_hotel_staff_id?: string | null
          hotel_notes?: string | null
          restaurant_notes?: string | null
          airport_staff_notes?: string | null
          hotel_staff_notes?: string | null
          total_revenue?: number | null
          margin_percent?: number | null
          tier?: string | null
          cost_mode?: string | null
          package_type?: "day-trips" | "tours-only" | "land-package" | "full-package" | "cruise-land" | "shore-excursions" | "cruise-package" | null
          supplier_cost?: number | null
          profit?: number | null
          available_languages?: string[] | null
          version_count?: number | null
        }
        Update: {
          id?: string | null
          itinerary_code?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          trip_name?: string | null
          start_date?: string | null
          end_date?: string | null
          total_days?: number | null
          num_adults?: number | null
          num_children?: number | null
          currency?: string | null
          total_cost?: number | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          user_id?: string | null
          client_id?: string | null
          payment_status?: string | null
          total_paid?: number | null
          deposit_amount?: number | null
          balance_due?: number | null
          assigned_guide_id?: string | null
          assigned_vehicle_id?: string | null
          guide_notes?: string | null
          vehicle_notes?: string | null
          pickup_location?: string | null
          pickup_time?: string | null
          destinations?: string | null
          num_travelers?: number | null
          assigned_hotel_id?: string | null
          assigned_restaurant_id?: string | null
          assigned_airport_staff_id?: string | null
          assigned_hotel_staff_id?: string | null
          hotel_notes?: string | null
          restaurant_notes?: string | null
          airport_staff_notes?: string | null
          hotel_staff_notes?: string | null
          total_revenue?: number | null
          margin_percent?: number | null
          tier?: string | null
          cost_mode?: string | null
          package_type?: "day-trips" | "tours-only" | "land-package" | "full-package" | "cruise-land" | "shore-excursions" | "cruise-package" | null
          supplier_cost?: number | null
          profit?: number | null
          available_languages?: string[] | null
          version_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itineraries_with_languages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_with_languages_assigned_guide_id_fkey"
            columns: ["assigned_guide_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_with_languages_assigned_vehicle_id_fkey"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_with_languages_assigned_hotel_id_fkey"
            columns: ["assigned_hotel_id"]
            isOneToOne: false
            referencedRelation: "hotel_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_with_languages_assigned_restaurant_id_fkey"
            columns: ["assigned_restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_with_languages_assigned_airport_staff_id_fkey"
            columns: ["assigned_airport_staff_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_with_languages_assigned_hotel_staff_id_fkey"
            columns: ["assigned_hotel_staff_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_day_versions: {
        Row: {
          id: string
          itinerary_day_id: string
          language: string
          title: string | null
          description: string | null
          city: string | null
          overnight_city: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          itinerary_day_id: string
          language: string
          title?: string | null
          description?: string | null
          city?: string | null
          overnight_city?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          itinerary_day_id?: string
          language?: string
          title?: string | null
          description?: string | null
          city?: string | null
          overnight_city?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_day_versions_itinerary_day_id_fkey"
            columns: ["itinerary_day_id"]
            isOneToOne: false
            referencedRelation: "itinerary_days"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_days: {
        Row: {
          id: string
          itinerary_id: string
          day_number: number
          date: string
          city: string | null
          title: string | null
          description: string | null
          overnight_city: string | null
          created_at: string | null
          attractions: string[] | null
          guide_required: boolean | null
          lunch_included: boolean | null
          dinner_included: boolean | null
          hotel_included: boolean | null
          flight_from: string | null
          is_cruise_day: boolean | null
          transport_type: string | null
          skip_arrival_checkin: boolean
          extras: string[]
          day_type: string
          overnight: boolean | null
          has_sightseeing: boolean | null
          airport_arrival: boolean | null
          airport_departure: boolean | null
          hotel_check_in: boolean | null
          hotel_check_out: boolean | null
          intercity: string | null
        }
        Insert: {
          id?: string
          itinerary_id: string
          day_number: number
          date: string
          city?: string | null
          title?: string | null
          description?: string | null
          overnight_city?: string | null
          created_at?: string | null
          attractions?: string[] | null
          guide_required?: boolean | null
          lunch_included?: boolean | null
          dinner_included?: boolean | null
          hotel_included?: boolean | null
          flight_from?: string | null
          is_cruise_day?: boolean | null
          transport_type?: string | null
          skip_arrival_checkin?: boolean
          extras: string[]
          day_type?: string
          overnight?: boolean | null
          has_sightseeing?: boolean | null
          airport_arrival?: boolean | null
          airport_departure?: boolean | null
          hotel_check_in?: boolean | null
          hotel_check_out?: boolean | null
          intercity?: string | null
        }
        Update: {
          id?: string
          itinerary_id?: string
          day_number?: number
          date?: string
          city?: string | null
          title?: string | null
          description?: string | null
          overnight_city?: string | null
          created_at?: string | null
          attractions?: string[] | null
          guide_required?: boolean | null
          lunch_included?: boolean | null
          dinner_included?: boolean | null
          hotel_included?: boolean | null
          flight_from?: string | null
          is_cruise_day?: boolean | null
          transport_type?: string | null
          skip_arrival_checkin?: boolean
          extras?: string[]
          day_type?: string
          overnight?: boolean | null
          has_sightseeing?: boolean | null
          airport_arrival?: boolean | null
          airport_departure?: boolean | null
          hotel_check_in?: boolean | null
          hotel_check_out?: boolean | null
          intercity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_days_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_resources: {
        Row: {
          id: string
          itinerary_id: string
          itinerary_day_id: string | null
          resource_type: string
          resource_id: string
          resource_name: string | null
          start_date: string
          end_date: string | null
          notes: string | null
          quantity: number | null
          cost_eur: number | null
          cost_non_eur: number | null
          status: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          itinerary_id: string
          itinerary_day_id?: string | null
          resource_type: string
          resource_id: string
          resource_name?: string | null
          start_date: string
          end_date?: string | null
          notes?: string | null
          quantity?: number | null
          cost_eur?: number | null
          cost_non_eur?: number | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          itinerary_id?: string
          itinerary_day_id?: string | null
          resource_type?: string
          resource_id?: string
          resource_name?: string | null
          start_date?: string
          end_date?: string | null
          notes?: string | null
          quantity?: number | null
          cost_eur?: number | null
          cost_non_eur?: number | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_resources_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_resources_itinerary_day_id_fkey"
            columns: ["itinerary_day_id"]
            isOneToOne: false
            referencedRelation: "itinerary_days"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_service_versions: {
        Row: {
          id: string
          itinerary_service_id: string
          language: string
          service_name: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          itinerary_service_id: string
          language: string
          service_name?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          itinerary_service_id?: string
          language?: string
          service_name?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_service_versions_itinerary_service_id_fkey"
            columns: ["itinerary_service_id"]
            isOneToOne: false
            referencedRelation: "itinerary_services"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_services: {
        Row: {
          id: string
          itinerary_day_id: string
          service_type: string
          service_code: string | null
          service_name: string
          quantity: number | null
          rate_eur: number | null
          rate_non_eur: number | null
          total_cost: number | null
          supplier_name: string | null
          notes: string | null
          created_at: string | null
          client_price: number | null
          supplier_id: string | null
          is_preferred_supplier: boolean | null
          commission_rate: number | null
          commission_amount: number | null
          commission_status: string | null
          vehicle_type: string | null
          pickup_location: string | null
          dropoff_location: string | null
          pickup_time: string | null
          supplier_currency: string | null
          supplier_cost_original: number | null
          exchange_rate_used: number | null
          sold_by_supplier_id: string | null
        }
        Insert: {
          id?: string
          itinerary_day_id: string
          service_type: string
          service_code?: string | null
          service_name: string
          quantity?: number | null
          rate_eur?: number | null
          rate_non_eur?: number | null
          total_cost?: number | null
          supplier_name?: string | null
          notes?: string | null
          created_at?: string | null
          client_price?: number | null
          supplier_id?: string | null
          is_preferred_supplier?: boolean | null
          commission_rate?: number | null
          commission_amount?: number | null
          commission_status?: string | null
          vehicle_type?: string | null
          pickup_location?: string | null
          dropoff_location?: string | null
          pickup_time?: string | null
          supplier_currency?: string | null
          supplier_cost_original?: number | null
          exchange_rate_used?: number | null
          sold_by_supplier_id?: string | null
        }
        Update: {
          id?: string
          itinerary_day_id?: string
          service_type?: string
          service_code?: string | null
          service_name?: string
          quantity?: number | null
          rate_eur?: number | null
          rate_non_eur?: number | null
          total_cost?: number | null
          supplier_name?: string | null
          notes?: string | null
          created_at?: string | null
          client_price?: number | null
          supplier_id?: string | null
          is_preferred_supplier?: boolean | null
          commission_rate?: number | null
          commission_amount?: number | null
          commission_status?: string | null
          vehicle_type?: string | null
          pickup_location?: string | null
          dropoff_location?: string | null
          pickup_time?: string | null
          supplier_currency?: string | null
          supplier_cost_original?: number | null
          exchange_rate_used?: number | null
          sold_by_supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_services_itinerary_day_id_fkey"
            columns: ["itinerary_day_id"]
            isOneToOne: false
            referencedRelation: "itinerary_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_services_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_services_sold_by_supplier_id_fkey"
            columns: ["sold_by_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_shares: {
        Row: {
          id: string
          org_id: string
          itinerary_id: string
          token: string
          created_by: string | null
          created_at: string
          revoked_at: string | null
          view_count: number
          last_viewed_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          itinerary_id: string
          token: string
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
          view_count?: number
          last_viewed_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          itinerary_id?: string
          token?: string
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
          view_count?: number
          last_viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_shares_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_shares_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_versions: {
        Row: {
          id: string
          itinerary_id: string
          language: string
          trip_name: string
          notes: string | null
          pickup_location: string | null
          guide_notes: string | null
          vehicle_notes: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          inclusions: string[] | null
          exclusions: string[] | null
        }
        Insert: {
          id?: string
          itinerary_id: string
          language: string
          trip_name: string
          notes?: string | null
          pickup_location?: string | null
          guide_notes?: string | null
          vehicle_notes?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          inclusions?: string[] | null
          exclusions?: string[] | null
        }
        Update: {
          id?: string
          itinerary_id?: string
          language?: string
          trip_name?: string
          notes?: string | null
          pickup_location?: string | null
          guide_notes?: string | null
          vehicle_notes?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          inclusions?: string[] | null
          exclusions?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_versions_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          id: string
          job_name: string
          started_at: string
          finished_at: string | null
          outcome: string | null
          detail: string | null
          created_at: string
        }
        Insert: {
          id?: string
          job_name: string
          started_at?: string
          finished_at?: string | null
          outcome?: string | null
          detail?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          job_name?: string
          started_at?: string
          finished_at?: string | null
          outcome?: string | null
          detail?: string | null
          created_at?: string
        }
        Relationships: []
      }
      meal_costs: {
        Row: {
          id: string
          meal_type: string
          cost_per_person: number
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          meal_type: string
          cost_per_person: number
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          meal_type?: string
          cost_per_person?: number
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      meal_rates: {
        Row: {
          id: string
          service_code: string
          restaurant_name: string
          meal_type: string | null
          cuisine_type: string | null
          restaurant_type: string | null
          city: string | null
          base_rate_eur: number | null
          base_rate_non_eur: number | null
          season: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          supplier_name: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          tier: string | null
          meal_category: string | null
          dietary_options: string[] | null
          per_person_rate: boolean | null
          minimum_pax: number | null
          supplier_id: string | null
          is_preferred: boolean | null
          rate_currency: string | null
        }
        Insert: {
          id?: string
          service_code: string
          restaurant_name: string
          meal_type?: string | null
          cuisine_type?: string | null
          restaurant_type?: string | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tier?: string | null
          meal_category?: string | null
          dietary_options?: string[] | null
          per_person_rate?: boolean | null
          minimum_pax?: number | null
          supplier_id?: string | null
          is_preferred?: boolean | null
          rate_currency?: string | null
        }
        Update: {
          id?: string
          service_code?: string
          restaurant_name?: string
          meal_type?: string | null
          cuisine_type?: string | null
          restaurant_type?: string | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tier?: string | null
          meal_category?: string | null
          dietary_options?: string[] | null
          per_person_rate?: boolean | null
          minimum_pax?: number | null
          supplier_id?: string | null
          is_preferred?: boolean | null
          rate_currency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          id: string
          name: string
          description: string | null
          category: string
          subcategory: string | null
          channel: string
          subject: string | null
          body: string
          placeholders: Json | null
          is_active: boolean | null
          usage_count: number | null
          last_used_at: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          language: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          category?: string
          subcategory?: string | null
          channel?: string
          subject?: string | null
          body: string
          placeholders?: Json | null
          is_active?: boolean | null
          usage_count?: number | null
          last_used_at?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          language?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          category?: string
          subcategory?: string | null
          channel?: string
          subject?: string | null
          body?: string
          placeholders?: Json | null
          is_active?: boolean | null
          usage_count?: number | null
          last_used_at?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          language?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nile_cruises: {
        Row: {
          id: string
          cruise_code: string
          ship_name: string
          ship_category: string
          route_name: string
          embark_city: string
          disembark_city: string
          duration_nights: number
          cabin_type: string
          rate_single_eur: number
          rate_double_eur: number
          rate_triple_eur: number | null
          meals_included: string | null
          sightseeing_included: boolean | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          season: string | null
          supplier_name: string | null
          is_active: boolean | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          description: string | null
          supplier_id: string | null
          is_preferred: boolean | null
          season_start: string | null
          season_end: string | null
          rate_double_eur_low: number | null
          rate_double_eur_high: number | null
          rate_double_eur_peak: number | null
          tier: string | null
          low_season_start: string | null
          low_season_end: string | null
          rate_low_single_eur: number | null
          rate_low_double_eur: number | null
          rate_low_triple_eur: number | null
          rate_low_suite_eur: number | null
          rate_low_single_non_eur: number | null
          rate_low_double_non_eur: number | null
          rate_low_triple_non_eur: number | null
          rate_low_suite_non_eur: number | null
          high_season_start: string | null
          high_season_end: string | null
          rate_high_single_eur: number | null
          rate_high_double_eur: number | null
          rate_high_triple_eur: number | null
          rate_high_suite_eur: number | null
          rate_high_single_non_eur: number | null
          rate_high_double_non_eur: number | null
          rate_high_triple_non_eur: number | null
          rate_high_suite_non_eur: number | null
          peak_season_1_start: string | null
          peak_season_1_end: string | null
          peak_season_2_start: string | null
          peak_season_2_end: string | null
          rate_peak_single_eur: number | null
          rate_peak_double_eur: number | null
          rate_peak_triple_eur: number | null
          rate_peak_suite_eur: number | null
          rate_peak_single_non_eur: number | null
          rate_peak_double_non_eur: number | null
          rate_peak_triple_non_eur: number | null
          rate_peak_suite_non_eur: number | null
          seasons: Json | null
          rate_currency: string | null
          property_id: string | null
        }
        Insert: {
          id?: string
          cruise_code: string
          ship_name: string
          ship_category: string
          route_name: string
          embark_city: string
          disembark_city: string
          duration_nights: number
          cabin_type: string
          rate_single_eur: number
          rate_double_eur: number
          rate_triple_eur?: number | null
          meals_included?: string | null
          sightseeing_included?: boolean | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          season?: string | null
          supplier_name?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          supplier_id?: string | null
          is_preferred?: boolean | null
          season_start?: string | null
          season_end?: string | null
          rate_double_eur_low?: number | null
          rate_double_eur_high?: number | null
          rate_double_eur_peak?: number | null
          tier?: string | null
          low_season_start?: string | null
          low_season_end?: string | null
          rate_low_single_eur?: number | null
          rate_low_double_eur?: number | null
          rate_low_triple_eur?: number | null
          rate_low_suite_eur?: number | null
          rate_low_single_non_eur?: number | null
          rate_low_double_non_eur?: number | null
          rate_low_triple_non_eur?: number | null
          rate_low_suite_non_eur?: number | null
          high_season_start?: string | null
          high_season_end?: string | null
          rate_high_single_eur?: number | null
          rate_high_double_eur?: number | null
          rate_high_triple_eur?: number | null
          rate_high_suite_eur?: number | null
          rate_high_single_non_eur?: number | null
          rate_high_double_non_eur?: number | null
          rate_high_triple_non_eur?: number | null
          rate_high_suite_non_eur?: number | null
          peak_season_1_start?: string | null
          peak_season_1_end?: string | null
          peak_season_2_start?: string | null
          peak_season_2_end?: string | null
          rate_peak_single_eur?: number | null
          rate_peak_double_eur?: number | null
          rate_peak_triple_eur?: number | null
          rate_peak_suite_eur?: number | null
          rate_peak_single_non_eur?: number | null
          rate_peak_double_non_eur?: number | null
          rate_peak_triple_non_eur?: number | null
          rate_peak_suite_non_eur?: number | null
          seasons?: Json | null
          rate_currency?: string | null
          property_id?: string | null
        }
        Update: {
          id?: string
          cruise_code?: string
          ship_name?: string
          ship_category?: string
          route_name?: string
          embark_city?: string
          disembark_city?: string
          duration_nights?: number
          cabin_type?: string
          rate_single_eur?: number
          rate_double_eur?: number
          rate_triple_eur?: number | null
          meals_included?: string | null
          sightseeing_included?: boolean | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          season?: string | null
          supplier_name?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          supplier_id?: string | null
          is_preferred?: boolean | null
          season_start?: string | null
          season_end?: string | null
          rate_double_eur_low?: number | null
          rate_double_eur_high?: number | null
          rate_double_eur_peak?: number | null
          tier?: string | null
          low_season_start?: string | null
          low_season_end?: string | null
          rate_low_single_eur?: number | null
          rate_low_double_eur?: number | null
          rate_low_triple_eur?: number | null
          rate_low_suite_eur?: number | null
          rate_low_single_non_eur?: number | null
          rate_low_double_non_eur?: number | null
          rate_low_triple_non_eur?: number | null
          rate_low_suite_non_eur?: number | null
          high_season_start?: string | null
          high_season_end?: string | null
          rate_high_single_eur?: number | null
          rate_high_double_eur?: number | null
          rate_high_triple_eur?: number | null
          rate_high_suite_eur?: number | null
          rate_high_single_non_eur?: number | null
          rate_high_double_non_eur?: number | null
          rate_high_triple_non_eur?: number | null
          rate_high_suite_non_eur?: number | null
          peak_season_1_start?: string | null
          peak_season_1_end?: string | null
          peak_season_2_start?: string | null
          peak_season_2_end?: string | null
          rate_peak_single_eur?: number | null
          rate_peak_double_eur?: number | null
          rate_peak_triple_eur?: number | null
          rate_peak_suite_eur?: number | null
          rate_peak_single_non_eur?: number | null
          rate_peak_double_non_eur?: number | null
          rate_peak_triple_non_eur?: number | null
          rate_peak_suite_non_eur?: number | null
          seasons?: Json | null
          rate_currency?: string | null
          property_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nile_cruises_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nile_cruises_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "supplier_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          team_member_id: string | null
          type: string
          title: string
          message: string | null
          link: string | null
          related_task_id: string | null
          is_read: boolean | null
          email_sent: boolean | null
          created_at: string | null
          updated_at: string | null
          related_itinerary_id: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          team_member_id?: string | null
          type: string
          title: string
          message?: string | null
          link?: string | null
          related_task_id?: string | null
          is_read?: boolean | null
          email_sent?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          related_itinerary_id?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          team_member_id?: string | null
          type?: string
          title?: string
          message?: string | null
          link?: string | null
          related_task_id?: string | null
          is_read?: boolean | null
          email_sent?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          related_itinerary_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_itinerary_id_fkey"
            columns: ["related_itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_capacity: {
        Row: {
          id: string
          org_id: string
          date: string
          status: string
          max_groups: number
          booked_groups: number
          max_guides: number | null
          booked_guides: number | null
          max_vehicles: number | null
          booked_vehicles: number | null
          notes: string | null
          internal_notes: string | null
          reason: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          org_id: string
          date: string
          status?: string
          max_groups?: number
          booked_groups?: number
          max_guides?: number | null
          booked_guides?: number | null
          max_vehicles?: number | null
          booked_vehicles?: number | null
          notes?: string | null
          internal_notes?: string | null
          reason?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          date?: string
          status?: string
          max_groups?: number
          booked_groups?: number
          max_guides?: number | null
          booked_guides?: number | null
          max_vehicles?: number | null
          booked_vehicles?: number | null
          notes?: string | null
          internal_notes?: string | null
          reason?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_capacity_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          org_id: string
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          org_id: string
          user_id: string
          role?: string
          created_at?: string
        }
        Update: {
          org_id?: string
          user_id?: string
          role?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          id: string
          name: string
          created_at: string
          updated_at: string
          whatsapp_ai_enabled: boolean
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          contact_email: string | null
          company_phone: string | null
          company_website: string | null
          tagline: string | null
          deposit_percent: number | null
          deposit_due_days: number | null
          balance_due_days_before_departure: number | null
          company_address: string | null
          document_contacts: Json
          offices: Json
          default_currency: string | null
          rate_currency: string
          default_margin_percent: number | null
          rate_change_alerts: string
          support_hours: Json | null
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          updated_at?: string
          whatsapp_ai_enabled?: boolean
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          contact_email?: string | null
          company_phone?: string | null
          company_website?: string | null
          tagline?: string | null
          deposit_percent?: number | null
          deposit_due_days?: number | null
          balance_due_days_before_departure?: number | null
          company_address?: string | null
          document_contacts: Json
          offices: Json
          default_currency?: string | null
          rate_currency?: string
          default_margin_percent?: number | null
          rate_change_alerts?: string
          support_hours?: Json | null
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          updated_at?: string
          whatsapp_ai_enabled?: boolean
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          contact_email?: string | null
          company_phone?: string | null
          company_website?: string | null
          tagline?: string | null
          deposit_percent?: number | null
          deposit_due_days?: number | null
          balance_due_days_before_departure?: number | null
          company_address?: string | null
          document_contacts?: Json
          offices?: Json
          default_currency?: string | null
          rate_currency?: string
          default_margin_percent?: number | null
          rate_change_alerts?: string
          support_hours?: Json | null
        }
        Relationships: []
      }
      outside_cairo_fees: {
        Row: {
          id: string
          fee_per_person: number
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          fee_per_person: number
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          fee_per_person?: number
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      overdue_followups: {
        Row: {
          id: string | null
          client_id: string | null
          followup_type: string | null
          title: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          assigned_to: string | null
          priority: string | null
          status: string | null
          completed_at: string | null
          completed_by: string | null
          related_itinerary_id: string | null
          related_communication_id: string | null
          send_reminder: boolean | null
          reminder_sent: boolean | null
          created_at: string | null
          updated_at: string | null
          completion_notes: string | null
          client_name: string | null
          client_email: string | null
          client_phone: string | null
        }
        Insert: {
          id?: string | null
          client_id?: string | null
          followup_type?: string | null
          title?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          assigned_to?: string | null
          priority?: string | null
          status?: string | null
          completed_at?: string | null
          completed_by?: string | null
          related_itinerary_id?: string | null
          related_communication_id?: string | null
          send_reminder?: boolean | null
          reminder_sent?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          completion_notes?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
        }
        Update: {
          id?: string | null
          client_id?: string | null
          followup_type?: string | null
          title?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          assigned_to?: string | null
          priority?: string | null
          status?: string | null
          completed_at?: string | null
          completed_by?: string | null
          related_itinerary_id?: string | null
          related_communication_id?: string | null
          send_reminder?: boolean | null
          reminder_sent?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          completion_notes?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overdue_followups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overdue_followups_related_itinerary_id_fkey"
            columns: ["related_itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overdue_followups_related_communication_id_fkey"
            columns: ["related_communication_id"]
            isOneToOne: false
            referencedRelation: "communication_history"
            referencedColumns: ["id"]
          },
        ]
      }
      package_type_definitions: {
        Row: {
          slug: string
          name: string
          description: string | null
          include_accommodation: boolean | null
          include_airport_transfers: boolean | null
          include_internal_transfers: boolean | null
          include_tours: boolean | null
          include_meals: string | null
          icon: string | null
          display_order: number | null
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          slug: string
          name: string
          description?: string | null
          include_accommodation?: boolean | null
          include_airport_transfers?: boolean | null
          include_internal_transfers?: boolean | null
          include_tours?: boolean | null
          include_meals?: string | null
          icon?: string | null
          display_order?: number | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          slug?: string
          name?: string
          description?: string | null
          include_accommodation?: boolean | null
          include_airport_transfers?: boolean | null
          include_internal_transfers?: boolean | null
          include_tours?: boolean | null
          include_meals?: string | null
          icon?: string | null
          display_order?: number | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          itinerary_id: string
          payment_type: string
          amount: number
          currency: string | null
          payment_method: string | null
          payment_status: string | null
          transaction_reference: string | null
          payment_date: string | null
          due_date: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          org_id: string
        }
        Insert: {
          id?: string
          itinerary_id: string
          payment_type: string
          amount: number
          currency?: string | null
          payment_method?: string | null
          payment_status?: string | null
          transaction_reference?: string | null
          payment_date?: string | null
          due_date?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          org_id: string
        }
        Update: {
          id?: string
          itinerary_id?: string
          payment_type?: string
          amount?: number
          currency?: string | null
          payment_method?: string | null
          payment_status?: string | null
          transaction_reference?: string | null
          payment_date?: string | null
          due_date?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_message_threads: {
        Row: {
          id: string
          org_id: string
          booking_id: string
          passenger_id: string | null
          last_message_at: string | null
          last_message_snippet: string | null
          last_sender: string | null
          staff_last_read_at: string | null
          customer_last_read_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          booking_id: string
          passenger_id?: string | null
          last_message_at?: string | null
          last_message_snippet?: string | null
          last_sender?: string | null
          staff_last_read_at?: string | null
          customer_last_read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          booking_id?: string
          passenger_id?: string | null
          last_message_at?: string | null
          last_message_snippet?: string | null
          last_sender?: string | null
          staff_last_read_at?: string | null
          customer_last_read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_message_threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_message_threads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_message_threads_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "booking_passengers"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_messages: {
        Row: {
          id: string
          org_id: string
          thread_id: string
          sender: string
          sender_user_id: string | null
          sender_name: string | null
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          thread_id: string
          sender: string
          sender_user_id?: string | null
          sender_name?: string | null
          body: string
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          thread_id?: string
          sender?: string
          sender_user_id?: string | null
          sender_name?: string | null
          body?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "portal_message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_season_dates: {
        Row: {
          id: string
          org_id: string
          season_id: string
          start_date: string
          end_date: string
          label: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          season_id: string
          start_date: string
          end_date: string
          label?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          season_id?: string
          start_date?: string
          end_date?: string
          label?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_season_dates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_season_dates_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "pricing_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_seasons: {
        Row: {
          id: string
          org_id: string
          name: string
          uplift_percent: number
          colour: string
          display_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          uplift_percent?: number
          colour?: string
          display_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          uplift_percent?: number
          colour?: string
          display_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_seasons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_margins: {
        Row: {
          id: string
          tour_type: string
          margin_percentage: number
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tour_type: string
          margin_percentage: number
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tour_type?: string
          margin_percentage?: number
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          id: string
          name: string
          purpose: string
          description: string | null
          system_prompt: string | null
          user_prompt_template: string
          variables: Json | null
          model: string | null
          temperature: number | null
          max_tokens: number | null
          is_active: boolean | null
          version: number | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          is_default: boolean | null
        }
        Insert: {
          id?: string
          name: string
          purpose: string
          description?: string | null
          system_prompt?: string | null
          user_prompt_template: string
          variables?: Json | null
          model?: string | null
          temperature?: number | null
          max_tokens?: number | null
          is_active?: boolean | null
          version?: number | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_default?: boolean | null
        }
        Update: {
          id?: string
          name?: string
          purpose?: string
          description?: string | null
          system_prompt?: string | null
          user_prompt_template?: string
          variables?: Json | null
          model?: string | null
          temperature?: number | null
          max_tokens?: number | null
          is_active?: boolean | null
          version?: number | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_default?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_revisions: {
        Row: {
          id: string
          quote_type: string
          quote_id: string
          version_number: number
          is_current: boolean | null
          quote_data: Json
          changed_by: string | null
          changed_at: string | null
          change_reason: string | null
          change_summary: string | null
          changes_diff: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          quote_type?: string
          quote_id: string
          version_number: number
          is_current?: boolean | null
          quote_data: Json
          changed_by?: string | null
          changed_at?: string | null
          change_reason?: string | null
          change_summary?: string | null
          changes_diff?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          quote_type?: string
          quote_id?: string
          version_number?: number
          is_current?: boolean | null
          quote_data?: Json
          changed_by?: string | null
          changed_at?: string | null
          change_reason?: string | null
          change_summary?: string | null
          changes_diff?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }
      quote_versions: {
        Row: {
          id: string
          quote_id: string
          language: string
          title: string | null
          notes: string | null
          terms_conditions: string | null
          special_requests: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          quote_id: string
          language: string
          title?: string | null
          notes?: string | null
          terms_conditions?: string | null
          special_requests?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          quote_id?: string
          language?: string
          title?: string | null
          notes?: string | null
          terms_conditions?: string | null
          special_requests?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_versions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "tour_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes_with_languages: {
        Row: {
          id: string | null
          quote_number: string | null
          variation_id: string | null
          partner_id: string | null
          client_name: string | null
          client_email: string | null
          client_phone: string | null
          client_nationality: string | null
          travel_date: string | null
          num_adults: number | null
          num_children: number | null
          services_snapshot: Json | null
          total_cost: number | null
          margin_percent: number | null
          margin_amount: number | null
          selling_price: number | null
          price_per_person: number | null
          currency: string | null
          status: string | null
          valid_until: string | null
          converted_to_itinerary_id: string | null
          converted_at: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          tour_leader_included: boolean | null
          tour_leader_cost: number | null
          single_supplement: number | null
          is_eur_passport: boolean | null
          season: string | null
          available_languages: string[] | null
          version_count: number | null
        }
        Insert: {
          id?: string | null
          quote_number?: string | null
          variation_id?: string | null
          partner_id?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          client_nationality?: string | null
          travel_date?: string | null
          num_adults?: number | null
          num_children?: number | null
          services_snapshot?: Json | null
          total_cost?: number | null
          margin_percent?: number | null
          margin_amount?: number | null
          selling_price?: number | null
          price_per_person?: number | null
          currency?: string | null
          status?: string | null
          valid_until?: string | null
          converted_to_itinerary_id?: string | null
          converted_at?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          tour_leader_included?: boolean | null
          tour_leader_cost?: number | null
          single_supplement?: number | null
          is_eur_passport?: boolean | null
          season?: string | null
          available_languages?: string[] | null
          version_count?: number | null
        }
        Update: {
          id?: string | null
          quote_number?: string | null
          variation_id?: string | null
          partner_id?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          client_nationality?: string | null
          travel_date?: string | null
          num_adults?: number | null
          num_children?: number | null
          services_snapshot?: Json | null
          total_cost?: number | null
          margin_percent?: number | null
          margin_amount?: number | null
          selling_price?: number | null
          price_per_person?: number | null
          currency?: string | null
          status?: string | null
          valid_until?: string | null
          converted_to_itinerary_id?: string | null
          converted_at?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          tour_leader_included?: boolean | null
          tour_leader_cost?: number | null
          single_supplement?: number | null
          is_eur_passport?: boolean | null
          season?: string | null
          available_languages?: string[] | null
          version_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_with_languages_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_with_languages_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "b2b_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_with_languages_converted_to_itinerary_id_fkey"
            columns: ["converted_to_itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_audit_log: {
        Row: {
          id: string
          table_name: string
          record_id: string
          action: string
          changed_fields: Json | null
          full_old_record: Json | null
          full_new_record: Json | null
          changed_by: string | null
          changed_at: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          table_name: string
          record_id: string
          action: string
          changed_fields?: Json | null
          full_old_record?: Json | null
          full_new_record?: Json | null
          changed_by?: string | null
          changed_at?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          table_name?: string
          record_id?: string
          action?: string
          changed_fields?: Json | null
          full_old_record?: Json | null
          full_new_record?: Json | null
          changed_by?: string | null
          changed_at?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      recent_audit_activity: {
        Row: {
          id: string | null
          created_at: string | null
          user_email: string | null
          user_role: string | null
          action: string | null
          table_name: string | null
          record_id: string | null
          status: string | null
          error_message: string | null
          changes: Json | null
        }
        Insert: {
          id?: string | null
          created_at?: string | null
          user_email?: string | null
          user_role?: string | null
          action?: string | null
          table_name?: string | null
          record_id?: string | null
          status?: string | null
          error_message?: string | null
          changes?: Json | null
        }
        Update: {
          id?: string | null
          created_at?: string | null
          user_email?: string | null
          user_role?: string | null
          action?: string | null
          table_name?: string | null
          record_id?: string | null
          status?: string | null
          error_message?: string | null
          changes?: Json | null
        }
        Relationships: []
      }
      reminder_settings: {
        Row: {
          id: string
          name: string
          days_offset: number
          is_active: boolean | null
          email_subject_template: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          days_offset: number
          is_active?: boolean | null
          email_subject_template?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          days_offset?: number
          is_active?: boolean | null
          email_subject_template?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      resource_calendar: {
        Row: {
          id: string | null
          itinerary_id: string | null
          itinerary_day_id: string | null
          resource_type: string | null
          resource_id: string | null
          resource_name: string | null
          start_date: string | null
          end_date: string | null
          quantity: number | null
          status: string | null
          notes: string | null
          itinerary_code: string | null
          client_name: string | null
          num_travelers: number | null
          itinerary_status: string | null
        }
        Insert: {
          id?: string | null
          itinerary_id?: string | null
          itinerary_day_id?: string | null
          resource_type?: string | null
          resource_id?: string | null
          resource_name?: string | null
          start_date?: string | null
          end_date?: string | null
          quantity?: number | null
          status?: string | null
          notes?: string | null
          itinerary_code?: string | null
          client_name?: string | null
          num_travelers?: number | null
          itinerary_status?: string | null
        }
        Update: {
          id?: string | null
          itinerary_id?: string | null
          itinerary_day_id?: string | null
          resource_type?: string | null
          resource_id?: string | null
          resource_name?: string | null
          start_date?: string | null
          end_date?: string | null
          quantity?: number | null
          status?: string | null
          notes?: string | null
          itinerary_code?: string | null
          client_name?: string | null
          num_travelers?: number | null
          itinerary_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_calendar_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_calendar_itinerary_day_id_fkey"
            columns: ["itinerary_day_id"]
            isOneToOne: false
            referencedRelation: "itinerary_days"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_conflicts: {
        Row: {
          assignment_1_id: string | null
          assignment_2_id: string | null
          resource_type: string | null
          resource_id: string | null
          resource_name: string | null
          itinerary_1_id: string | null
          itinerary_2_id: string | null
          itinerary_1_code: string | null
          itinerary_2_code: string | null
          client_1: string | null
          client_2: string | null
          start_1: string | null
          end_1: string | null
          start_2: string | null
          end_2: string | null
        }
        Insert: {
          assignment_1_id?: string | null
          assignment_2_id?: string | null
          resource_type?: string | null
          resource_id?: string | null
          resource_name?: string | null
          itinerary_1_id?: string | null
          itinerary_2_id?: string | null
          itinerary_1_code?: string | null
          itinerary_2_code?: string | null
          client_1?: string | null
          client_2?: string | null
          start_1?: string | null
          end_1?: string | null
          start_2?: string | null
          end_2?: string | null
        }
        Update: {
          assignment_1_id?: string | null
          assignment_2_id?: string | null
          resource_type?: string | null
          resource_id?: string | null
          resource_name?: string | null
          itinerary_1_id?: string | null
          itinerary_2_id?: string | null
          itinerary_1_code?: string | null
          itinerary_2_code?: string | null
          client_1?: string | null
          client_2?: string | null
          start_1?: string | null
          end_1?: string | null
          start_2?: string | null
          end_2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_conflicts_itinerary_1_id_fkey"
            columns: ["itinerary_1_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_conflicts_itinerary_2_id_fkey"
            columns: ["itinerary_2_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_contacts: {
        Row: {
          id: string
          name: string
          restaurant_type: string | null
          cuisine_type: string | null
          city: string
          address: string | null
          contact_person: string | null
          phone: string | null
          email: string | null
          whatsapp: string | null
          capacity: number | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          meal_types: string[] | null
          dietary_options: string[] | null
          rate_per_person_eur: number | null
          rate_per_person_non_eur: number | null
          rate_breakfast_eur: number | null
          rate_lunch_eur: number | null
          rate_dinner_eur: number | null
          rate_breakfast_non_eur: number | null
          rate_lunch_non_eur: number | null
          rate_dinner_non_eur: number | null
          drinks_included: boolean | null
          tip_included: boolean | null
          child_discount_percent: number | null
          group_discount_percent: number | null
          group_min_size: number | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          tier: string | null
          is_preferred: boolean | null
          cuisine_types: string[] | null
        }
        Insert: {
          id?: string
          name: string
          restaurant_type?: string | null
          cuisine_type?: string | null
          city: string
          address?: string | null
          contact_person?: string | null
          phone?: string | null
          email?: string | null
          whatsapp?: string | null
          capacity?: number | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          meal_types?: string[] | null
          dietary_options?: string[] | null
          rate_per_person_eur?: number | null
          rate_per_person_non_eur?: number | null
          rate_breakfast_eur?: number | null
          rate_lunch_eur?: number | null
          rate_dinner_eur?: number | null
          rate_breakfast_non_eur?: number | null
          rate_lunch_non_eur?: number | null
          rate_dinner_non_eur?: number | null
          drinks_included?: boolean | null
          tip_included?: boolean | null
          child_discount_percent?: number | null
          group_discount_percent?: number | null
          group_min_size?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          cuisine_types?: string[] | null
        }
        Update: {
          id?: string
          name?: string
          restaurant_type?: string | null
          cuisine_type?: string | null
          city?: string
          address?: string | null
          contact_person?: string | null
          phone?: string | null
          email?: string | null
          whatsapp?: string | null
          capacity?: number | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          meal_types?: string[] | null
          dietary_options?: string[] | null
          rate_per_person_eur?: number | null
          rate_per_person_non_eur?: number | null
          rate_breakfast_eur?: number | null
          rate_lunch_eur?: number | null
          rate_dinner_eur?: number | null
          rate_breakfast_non_eur?: number | null
          rate_lunch_non_eur?: number | null
          rate_dinner_non_eur?: number | null
          drinks_included?: boolean | null
          tip_included?: boolean | null
          child_discount_percent?: number | null
          group_discount_percent?: number | null
          group_min_size?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          cuisine_types?: string[] | null
        }
        Relationships: []
      }
      sales_agents: {
        Row: {
          id: string
          user_id: string | null
          name: string
          email: string | null
          phone: string | null
          avatar_url: string | null
          is_active: boolean | null
          is_available: boolean | null
          max_conversations: number | null
          current_conversations: number | null
          last_assigned_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          email?: string | null
          phone?: string | null
          avatar_url?: string | null
          is_active?: boolean | null
          is_available?: boolean | null
          max_conversations?: number | null
          current_conversations?: number | null
          last_assigned_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string
          email?: string | null
          phone?: string | null
          avatar_url?: string | null
          is_active?: boolean | null
          is_available?: boolean | null
          max_conversations?: number | null
          current_conversations?: number | null
          last_assigned_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      schema_migrations: {
        Row: {
          name: string
          applied_at: string
        }
        Insert: {
          name: string
          applied_at?: string
        }
        Update: {
          name?: string
          applied_at?: string
        }
        Relationships: []
      }
      seasonal_adjustments: {
        Row: {
          id: string
          season_name: string
          season_code: string
          start_date: string
          end_date: string
          price_multiplier: number | null
          applies_to_categories: string[] | null
          applies_to_destinations: string[] | null
          description: string | null
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          season_name: string
          season_code: string
          start_date: string
          end_date: string
          price_multiplier?: number | null
          applies_to_categories?: string[] | null
          applies_to_destinations?: string[] | null
          description?: string | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          season_name?: string
          season_code?: string
          start_date?: string
          end_date?: string
          price_multiplier?: number | null
          applies_to_categories?: string[] | null
          applies_to_destinations?: string[] | null
          description?: string | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      seasonal_rates: {
        Row: {
          id: string
          season_name: string
          start_month: number
          end_month: number
          increase_percentage: number
          applies_to: string
          is_active: boolean | null
          created_at: string | null
          supplier_id: string | null
        }
        Insert: {
          id?: string
          season_name: string
          start_month: number
          end_month: number
          increase_percentage: number
          applies_to: string
          is_active?: boolean | null
          created_at?: string | null
          supplier_id?: string | null
        }
        Update: {
          id?: string
          season_name?: string
          start_month?: number
          end_month?: number
          increase_percentage?: number
          applies_to?: string
          is_active?: boolean | null
          created_at?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seasonal_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_fees: {
        Row: {
          id: string
          service_code: string
          service_name: string
          service_category: string
          service_type: string | null
          city: string | null
          base_rate_eur: number
          base_rate_non_eur: number
          rate_type: string | null
          season: string | null
          rate_valid_from: string
          rate_valid_to: string
          supplier_name: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          service_code: string
          service_name: string
          service_category: string
          service_type?: string | null
          city?: string | null
          base_rate_eur: number
          base_rate_non_eur: number
          rate_type?: string | null
          season?: string | null
          rate_valid_from: string
          rate_valid_to: string
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          service_code?: string
          service_name?: string
          service_category?: string
          service_type?: string | null
          city?: string | null
          base_rate_eur?: number
          base_rate_non_eur?: number
          rate_type?: string | null
          season?: string | null
          rate_valid_from?: string
          rate_valid_to?: string
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sleeping_train_rates: {
        Row: {
          id: string
          service_code: string
          origin_city: string | null
          destination_city: string | null
          cabin_type: string | null
          rate_oneway_eur: number | null
          rate_roundtrip_eur: number | null
          departure_time: string | null
          arrival_time: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          season: string | null
          operator_name: string | null
          is_active: boolean | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          description: string | null
          supplier_id: string | null
          rate_currency: string | null
          property_id: string | null
        }
        Insert: {
          id?: string
          service_code: string
          origin_city?: string | null
          destination_city?: string | null
          cabin_type?: string | null
          rate_oneway_eur?: number | null
          rate_roundtrip_eur?: number | null
          departure_time?: string | null
          arrival_time?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          season?: string | null
          operator_name?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          supplier_id?: string | null
          rate_currency?: string | null
          property_id?: string | null
        }
        Update: {
          id?: string
          service_code?: string
          origin_city?: string | null
          destination_city?: string | null
          cabin_type?: string | null
          rate_oneway_eur?: number | null
          rate_roundtrip_eur?: number | null
          departure_time?: string | null
          arrival_time?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          season?: string | null
          operator_name?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          supplier_id?: string | null
          rate_currency?: string | null
          property_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sleeping_train_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sleeping_train_rates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "supplier_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_documents: {
        Row: {
          id: string
          itinerary_id: string | null
          supplier_id: string | null
          document_type: string
          document_number: string
          supplier_name: string
          supplier_contact_name: string | null
          supplier_contact_email: string | null
          supplier_contact_phone: string | null
          supplier_address: string | null
          client_name: string
          client_nationality: string | null
          num_adults: number | null
          num_children: number | null
          services: Json | null
          city: string | null
          service_date: string | null
          check_in: string | null
          check_out: string | null
          pickup_time: string | null
          pickup_location: string | null
          dropoff_location: string | null
          currency: string | null
          total_cost: number | null
          payment_terms: string | null
          payment_status: string | null
          special_requests: string | null
          internal_notes: string | null
          status: string | null
          sent_at: string | null
          sent_via: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          completed_at: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          selected_attractions: Json | null
          supplier_whatsapp: string | null
          selected_routes: Json | null
          selected_meals: Json | null
          selected_guides: Json | null
        }
        Insert: {
          id?: string
          itinerary_id?: string | null
          supplier_id?: string | null
          document_type: string
          document_number: string
          supplier_name: string
          supplier_contact_name?: string | null
          supplier_contact_email?: string | null
          supplier_contact_phone?: string | null
          supplier_address?: string | null
          client_name: string
          client_nationality?: string | null
          num_adults?: number | null
          num_children?: number | null
          services?: Json | null
          city?: string | null
          service_date?: string | null
          check_in?: string | null
          check_out?: string | null
          pickup_time?: string | null
          pickup_location?: string | null
          dropoff_location?: string | null
          currency?: string | null
          total_cost?: number | null
          payment_terms?: string | null
          payment_status?: string | null
          special_requests?: string | null
          internal_notes?: string | null
          status?: string | null
          sent_at?: string | null
          sent_via?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          completed_at?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          selected_attractions?: Json | null
          supplier_whatsapp?: string | null
          selected_routes?: Json | null
          selected_meals?: Json | null
          selected_guides?: Json | null
        }
        Update: {
          id?: string
          itinerary_id?: string | null
          supplier_id?: string | null
          document_type?: string
          document_number?: string
          supplier_name?: string
          supplier_contact_name?: string | null
          supplier_contact_email?: string | null
          supplier_contact_phone?: string | null
          supplier_address?: string | null
          client_name?: string
          client_nationality?: string | null
          num_adults?: number | null
          num_children?: number | null
          services?: Json | null
          city?: string | null
          service_date?: string | null
          check_in?: string | null
          check_out?: string | null
          pickup_time?: string | null
          pickup_location?: string | null
          dropoff_location?: string | null
          currency?: string | null
          total_cost?: number | null
          payment_terms?: string | null
          payment_status?: string | null
          special_requests?: string | null
          internal_notes?: string | null
          status?: string | null
          sent_at?: string | null
          sent_via?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          completed_at?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          selected_attractions?: Json | null
          supplier_whatsapp?: string | null
          selected_routes?: Json | null
          selected_meals?: Json | null
          selected_guides?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_documents_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_expenses: {
        Row: {
          id: string
          supplier_invoice_id: string
          expense_id: string
          matched_amount: number | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          supplier_invoice_id: string
          expense_id: string
          matched_amount?: number | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          supplier_invoice_id?: string
          expense_id?: string
          matched_amount?: number | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_expenses_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_expenses_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          id: string
          supplier_invoice_number: string
          internal_reference: string | null
          supplier_name: string
          supplier_id: string | null
          invoice_date: string
          due_date: string | null
          amount: number
          currency: string | null
          tax_amount: number | null
          description: string | null
          line_items: Json | null
          status: string | null
          match_status: string | null
          matched_amount: number | null
          discrepancy_amount: number | null
          discrepancy_notes: string | null
          document_url: string | null
          document_filename: string | null
          document_storage_path: string | null
          approved_by: string | null
          approved_at: string | null
          paid_at: string | null
          payment_method: string | null
          payment_reference: string | null
          notes: string | null
          itinerary_id: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          org_id: string
        }
        Insert: {
          id?: string
          supplier_invoice_number: string
          internal_reference?: string | null
          supplier_name: string
          supplier_id?: string | null
          invoice_date: string
          due_date?: string | null
          amount: number
          currency?: string | null
          tax_amount?: number | null
          description?: string | null
          line_items?: Json | null
          status?: string | null
          match_status?: string | null
          matched_amount?: number | null
          discrepancy_amount?: number | null
          discrepancy_notes?: string | null
          document_url?: string | null
          document_filename?: string | null
          document_storage_path?: string | null
          approved_by?: string | null
          approved_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          notes?: string | null
          itinerary_id?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          org_id: string
        }
        Update: {
          id?: string
          supplier_invoice_number?: string
          internal_reference?: string | null
          supplier_name?: string
          supplier_id?: string | null
          invoice_date?: string
          due_date?: string | null
          amount?: number
          currency?: string | null
          tax_amount?: number | null
          description?: string | null
          line_items?: Json | null
          status?: string | null
          match_status?: string | null
          matched_amount?: number | null
          discrepancy_amount?: number | null
          discrepancy_notes?: string | null
          document_url?: string | null
          document_filename?: string | null
          document_storage_path?: string | null
          approved_by?: string | null
          approved_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          notes?: string | null
          itinerary_id?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_properties: {
        Row: {
          id: string
          supplier_id: string
          property_type: string
          name: string
          city: string | null
          category: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_email: string | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          supplier_id: string
          property_type: string
          name: string
          city?: string | null
          category?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_email?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          supplier_id?: string
          property_type?: string
          name?: string
          city?: string | null
          category?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_email?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_properties_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          id: string
          name: string
          type: string
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          website: string | null
          address: string | null
          city: string | null
          country: string | null
          default_commission_rate: number | null
          commission_type: string | null
          payment_terms: string | null
          bank_details: string | null
          status: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          phone2: string | null
          whatsapp: string | null
          languages: string[] | null
          vehicle_types: string[] | null
          star_rating: string | null
          cuisine_types: string[] | null
          routes: string[] | null
          cabin_count: number | null
          capacity: number | null
          entity_kind: string | null
          tier: string | null
          daily_rate: number | null
          hourly_rate: number | null
          is_preferred: boolean | null
          max_group_size: number | null
          specialties: string[] | null
          certification_number: string | null
          license_expiry: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          profile_photo_url: string | null
          types: string[]
          airport_location: string | null
          shift_times: string | null
          service_role: string | null
        }
        Insert: {
          id?: string
          name: string
          type: string
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          website?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          default_commission_rate?: number | null
          commission_type?: string | null
          payment_terms?: string | null
          bank_details?: string | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          phone2?: string | null
          whatsapp?: string | null
          languages?: string[] | null
          vehicle_types?: string[] | null
          star_rating?: string | null
          cuisine_types?: string[] | null
          routes?: string[] | null
          cabin_count?: number | null
          capacity?: number | null
          entity_kind?: string | null
          tier?: string | null
          daily_rate?: number | null
          hourly_rate?: number | null
          is_preferred?: boolean | null
          max_group_size?: number | null
          specialties?: string[] | null
          certification_number?: string | null
          license_expiry?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          profile_photo_url?: string | null
          types: string[]
          airport_location?: string | null
          shift_times?: string | null
          service_role?: string | null
        }
        Update: {
          id?: string
          name?: string
          type?: string
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          website?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          default_commission_rate?: number | null
          commission_type?: string | null
          payment_terms?: string | null
          bank_details?: string | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          phone2?: string | null
          whatsapp?: string | null
          languages?: string[] | null
          vehicle_types?: string[] | null
          star_rating?: string | null
          cuisine_types?: string[] | null
          routes?: string[] | null
          cabin_count?: number | null
          capacity?: number | null
          entity_kind?: string | null
          tier?: string | null
          daily_rate?: number | null
          hourly_rate?: number | null
          is_preferred?: boolean | null
          max_group_size?: number | null
          specialties?: string[] | null
          certification_number?: string | null
          license_expiry?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          profile_photo_url?: string | null
          types?: string[]
          airport_location?: string | null
          shift_times?: string | null
          service_role?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          due_date: string | null
          priority: string | null
          status: string | null
          assigned_to: string | null
          linked_type: string | null
          linked_id: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          completed_at: string | null
          archived: boolean
          archived_at: string | null
          department_id: string | null
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          due_date?: string | null
          priority?: string | null
          status?: string | null
          assigned_to?: string | null
          linked_type?: string | null
          linked_id?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          completed_at?: string | null
          archived?: boolean
          archived_at?: string | null
          department_id?: string | null
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          due_date?: string | null
          priority?: string | null
          status?: string | null
          assigned_to?: string | null
          linked_type?: string | null
          linked_id?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          completed_at?: string | null
          archived?: boolean
          archived_at?: string | null
          department_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          name: string
          email: string | null
          phone: string | null
          role: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          user_id: string | null
          is_available: boolean | null
          max_conversations: number | null
          current_conversations: number | null
          last_assigned_at: string | null
          avatar_url: string | null
          department_id: string | null
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          phone?: string | null
          role?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          is_available?: boolean | null
          max_conversations?: number | null
          current_conversations?: number | null
          last_assigned_at?: string | null
          avatar_url?: string | null
          department_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          email?: string | null
          phone?: string | null
          role?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          is_available?: boolean | null
          max_conversations?: number | null
          current_conversations?: number | null
          last_assigned_at?: string | null
          avatar_url?: string | null
          department_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      template_placeholders: {
        Row: {
          id: string
          placeholder: string
          display_name: string
          description: string | null
          data_source: string | null
          category: string | null
          example_value: string | null
          created_at: string | null
          display_name_ja: string | null
          description_ja: string | null
          example_value_ja: string | null
        }
        Insert: {
          id?: string
          placeholder: string
          display_name: string
          description?: string | null
          data_source?: string | null
          category?: string | null
          example_value?: string | null
          created_at?: string | null
          display_name_ja?: string | null
          description_ja?: string | null
          example_value_ja?: string | null
        }
        Update: {
          id?: string
          placeholder?: string
          display_name?: string
          description?: string | null
          data_source?: string | null
          category?: string | null
          example_value?: string | null
          created_at?: string | null
          display_name_ja?: string | null
          description_ja?: string | null
          example_value_ja?: string | null
        }
        Relationships: []
      }
      template_send_log: {
        Row: {
          id: string
          template_id: string | null
          template_name: string | null
          channel: string | null
          client_id: string | null
          itinerary_id: string | null
          recipient_email: string | null
          recipient_phone: string | null
          subject: string | null
          body_preview: string | null
          status: string | null
          error_message: string | null
          sent_by: string | null
          sent_at: string | null
        }
        Insert: {
          id?: string
          template_id?: string | null
          template_name?: string | null
          channel?: string | null
          client_id?: string | null
          itinerary_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          subject?: string | null
          body_preview?: string | null
          status?: string | null
          error_message?: string | null
          sent_by?: string | null
          sent_at?: string | null
        }
        Update: {
          id?: string
          template_id?: string | null
          template_name?: string | null
          channel?: string | null
          client_id?: string | null
          itinerary_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          subject?: string | null
          body_preview?: string | null
          status?: string | null
          error_message?: string | null
          sent_by?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_send_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_send_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_send_log_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tipping_rates: {
        Row: {
          id: string
          service_code: string
          role_type: string
          rate_unit: string
          rate_eur: number
          context: string | null
          is_active: boolean | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          description: string | null
          rate_currency: string | null
        }
        Insert: {
          id?: string
          service_code: string
          role_type: string
          rate_unit: string
          rate_eur: number
          context?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          rate_currency?: string | null
        }
        Update: {
          id?: string
          service_code?: string
          role_type?: string
          rate_unit?: string
          rate_eur?: number
          context?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          rate_currency?: string | null
        }
        Relationships: []
      }
      tour_availability: {
        Row: {
          id: string
          variation_id: string | null
          date: string
          is_available: boolean | null
          available_spots: number | null
          reason: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          variation_id?: string | null
          date: string
          is_available?: boolean | null
          available_spots?: number | null
          reason?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          variation_id?: string | null
          date?: string
          is_available?: boolean | null
          available_spots?: number | null
          reason?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_availability_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_categories: {
        Row: {
          id: string
          category_code: string
          category_name: string
          description: string | null
          icon: string | null
          sort_order: number | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          category_code: string
          category_name: string
          description?: string | null
          icon?: string | null
          sort_order?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          category_code?: string
          category_name?: string
          description?: string | null
          icon?: string | null
          sort_order?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tour_day_activities: {
        Row: {
          id: string
          template_id: string
          day_number: number
          sequence_order: number | null
          content_id: string | null
          activity_type: string
          activity_name: string
          city: string | null
          duration_hours: number | null
          start_time: string | null
          is_optional: boolean | null
          is_included: boolean | null
          requires_guide: boolean | null
          notes: string | null
          internal_notes: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          template_id: string
          day_number: number
          sequence_order?: number | null
          content_id?: string | null
          activity_type: string
          activity_name: string
          city?: string | null
          duration_hours?: number | null
          start_time?: string | null
          is_optional?: boolean | null
          is_included?: boolean | null
          requires_guide?: boolean | null
          notes?: string | null
          internal_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          template_id?: string
          day_number?: number
          sequence_order?: number | null
          content_id?: string | null
          activity_type?: string
          activity_name?: string
          city?: string | null
          duration_hours?: number | null
          start_time?: string | null
          is_optional?: boolean | null
          is_included?: boolean | null
          requires_guide?: boolean | null
          notes?: string | null
          internal_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_day_activities_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tour_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_days: {
        Row: {
          id: string
          tour_id: string | null
          day_number: number
          city: string
          accommodation_id: string | null
          breakfast_included: boolean | null
          lunch_meal_id: string | null
          dinner_meal_id: string | null
          guide_required: boolean | null
          guide_id: string | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tour_id?: string | null
          day_number: number
          city: string
          accommodation_id?: string | null
          breakfast_included?: boolean | null
          lunch_meal_id?: string | null
          dinner_meal_id?: string | null
          guide_required?: boolean | null
          guide_id?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tour_id?: string | null
          day_number?: number
          city?: string
          accommodation_id?: string | null
          breakfast_included?: boolean | null
          lunch_meal_id?: string | null
          dinner_meal_id?: string | null
          guide_required?: boolean | null
          guide_id?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_days_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_days_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_days_lunch_meal_id_fkey"
            columns: ["lunch_meal_id"]
            isOneToOne: false
            referencedRelation: "meal_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_days_dinner_meal_id_fkey"
            columns: ["dinner_meal_id"]
            isOneToOne: false
            referencedRelation: "meal_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_days_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guide_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_departures: {
        Row: {
          id: string
          org_id: string
          template_id: string | null
          variation_id: string | null
          tour_name: string
          tour_code: string | null
          duration_days: number
          start_date: string
          end_date: string
          max_pax: number
          booked_pax: number
          min_pax: number | null
          status: string
          cutoff_days: number | null
          is_guaranteed: boolean | null
          price_per_person: number | null
          currency: string | null
          assigned_guide_id: string | null
          assigned_vehicle_id: string | null
          public_notes: string | null
          internal_notes: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          source_integration_id: string | null
          external_id: string | null
          externally_managed: boolean
          external_synced_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          template_id?: string | null
          variation_id?: string | null
          tour_name: string
          tour_code?: string | null
          duration_days?: number
          start_date: string
          end_date: string
          max_pax?: number
          booked_pax?: number
          min_pax?: number | null
          status?: string
          cutoff_days?: number | null
          is_guaranteed?: boolean | null
          price_per_person?: number | null
          currency?: string | null
          assigned_guide_id?: string | null
          assigned_vehicle_id?: string | null
          public_notes?: string | null
          internal_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          source_integration_id?: string | null
          external_id?: string | null
          externally_managed?: boolean
          external_synced_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          template_id?: string | null
          variation_id?: string | null
          tour_name?: string
          tour_code?: string | null
          duration_days?: number
          start_date?: string
          end_date?: string
          max_pax?: number
          booked_pax?: number
          min_pax?: number | null
          status?: string
          cutoff_days?: number | null
          is_guaranteed?: boolean | null
          price_per_person?: number | null
          currency?: string | null
          assigned_guide_id?: string | null
          assigned_vehicle_id?: string | null
          public_notes?: string | null
          internal_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          source_integration_id?: string | null
          external_id?: string | null
          externally_managed?: boolean
          external_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_departures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_departures_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tour_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_departures_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_departures_source_integration_id_fkey"
            columns: ["source_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_overview: {
        Row: {
          template_code: string | null
          template_name: string | null
          category_name: string | null
          destination_name: string | null
          duration_days: number | null
          variation_code: string | null
          tier: string | null
          group_type: string | null
          min_pax: number | null
          max_pax: number | null
          price_from: number | null
          is_featured: boolean | null
          popularity_score: number | null
        }
        Insert: {
          template_code?: string | null
          template_name?: string | null
          category_name?: string | null
          destination_name?: string | null
          duration_days?: number | null
          variation_code?: string | null
          tier?: string | null
          group_type?: string | null
          min_pax?: number | null
          max_pax?: number | null
          price_from?: number | null
          is_featured?: boolean | null
          popularity_score?: number | null
        }
        Update: {
          template_code?: string | null
          template_name?: string | null
          category_name?: string | null
          destination_name?: string | null
          duration_days?: number | null
          variation_code?: string | null
          tier?: string | null
          group_type?: string | null
          min_pax?: number | null
          max_pax?: number | null
          price_from?: number | null
          is_featured?: boolean | null
          popularity_score?: number | null
        }
        Relationships: []
      }
      tour_pricing: {
        Row: {
          id: string
          tour_id: string | null
          pax: number
          is_euro_passport: boolean
          total_accommodation: number | null
          total_meals: number | null
          total_guides: number | null
          total_transportation: number | null
          total_entrances: number | null
          grand_total: number | null
          per_person_total: number | null
          calculated_at: string | null
        }
        Insert: {
          id?: string
          tour_id?: string | null
          pax: number
          is_euro_passport: boolean
          total_accommodation?: number | null
          total_meals?: number | null
          total_guides?: number | null
          total_transportation?: number | null
          total_entrances?: number | null
          grand_total?: number | null
          per_person_total?: number | null
          calculated_at?: string | null
        }
        Update: {
          id?: string
          tour_id?: string | null
          pax?: number
          is_euro_passport?: boolean
          total_accommodation?: number | null
          total_meals?: number | null
          total_guides?: number | null
          total_transportation?: number | null
          total_entrances?: number | null
          grand_total?: number | null
          per_person_total?: number | null
          calculated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_pricing_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_quotes: {
        Row: {
          id: string
          quote_number: string
          variation_id: string | null
          partner_id: string | null
          client_name: string | null
          client_email: string | null
          client_phone: string | null
          client_nationality: string | null
          travel_date: string | null
          num_adults: number
          num_children: number | null
          services_snapshot: Json | null
          total_cost: number | null
          margin_percent: number | null
          margin_amount: number | null
          selling_price: number | null
          price_per_person: number | null
          currency: string | null
          status: string | null
          valid_until: string | null
          converted_to_itinerary_id: string | null
          converted_at: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          tour_leader_included: boolean | null
          tour_leader_cost: number | null
          single_supplement: number | null
          is_eur_passport: boolean | null
          season: string | null
          itinerary_id: string | null
          trip_name: string | null
          source: string | null
          version: number | null
          last_modified_by: string | null
          last_modified_at: string | null
          season_name: string | null
          season_uplift_percent: number
          season_uplift_amount: number
          org_id: string
        }
        Insert: {
          id?: string
          quote_number: string
          variation_id?: string | null
          partner_id?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          client_nationality?: string | null
          travel_date?: string | null
          num_adults?: number
          num_children?: number | null
          services_snapshot?: Json | null
          total_cost?: number | null
          margin_percent?: number | null
          margin_amount?: number | null
          selling_price?: number | null
          price_per_person?: number | null
          currency?: string | null
          status?: string | null
          valid_until?: string | null
          converted_to_itinerary_id?: string | null
          converted_at?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          tour_leader_included?: boolean | null
          tour_leader_cost?: number | null
          single_supplement?: number | null
          is_eur_passport?: boolean | null
          season?: string | null
          itinerary_id?: string | null
          trip_name?: string | null
          source?: string | null
          version?: number | null
          last_modified_by?: string | null
          last_modified_at?: string | null
          season_name?: string | null
          season_uplift_percent?: number
          season_uplift_amount?: number
          org_id: string
        }
        Update: {
          id?: string
          quote_number?: string
          variation_id?: string | null
          partner_id?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          client_nationality?: string | null
          travel_date?: string | null
          num_adults?: number
          num_children?: number | null
          services_snapshot?: Json | null
          total_cost?: number | null
          margin_percent?: number | null
          margin_amount?: number | null
          selling_price?: number | null
          price_per_person?: number | null
          currency?: string | null
          status?: string | null
          valid_until?: string | null
          converted_to_itinerary_id?: string | null
          converted_at?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          tour_leader_included?: boolean | null
          tour_leader_cost?: number | null
          single_supplement?: number | null
          is_eur_passport?: boolean | null
          season?: string | null
          itinerary_id?: string | null
          trip_name?: string | null
          source?: string | null
          version?: number | null
          last_modified_by?: string | null
          last_modified_at?: string | null
          season_name?: string | null
          season_uplift_percent?: number
          season_uplift_amount?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_quotes_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_quotes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "b2b_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_quotes_converted_to_itinerary_id_fkey"
            columns: ["converted_to_itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_quotes_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_quotes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_reviews: {
        Row: {
          id: string
          template_id: string | null
          variation_id: string | null
          customer_name: string | null
          customer_country: string | null
          rating: number | null
          review_title: string | null
          review_text: string | null
          pros: string[] | null
          cons: string[] | null
          would_recommend: boolean | null
          travel_date: string | null
          review_date: string | null
          is_verified: boolean | null
          is_featured: boolean | null
          is_published: boolean | null
        }
        Insert: {
          id?: string
          template_id?: string | null
          variation_id?: string | null
          customer_name?: string | null
          customer_country?: string | null
          rating?: number | null
          review_title?: string | null
          review_text?: string | null
          pros?: string[] | null
          cons?: string[] | null
          would_recommend?: boolean | null
          travel_date?: string | null
          review_date?: string | null
          is_verified?: boolean | null
          is_featured?: boolean | null
          is_published?: boolean | null
        }
        Update: {
          id?: string
          template_id?: string | null
          variation_id?: string | null
          customer_name?: string | null
          customer_country?: string | null
          rating?: number | null
          review_title?: string | null
          review_text?: string | null
          pros?: string[] | null
          cons?: string[] | null
          would_recommend?: boolean | null
          travel_date?: string | null
          review_date?: string | null
          is_verified?: boolean | null
          is_featured?: boolean | null
          is_published?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_reviews_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tour_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_reviews_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_template_defaults: {
        Row: {
          id: string
          template_id: string
          default_vehicle_id: string | null
          default_guide_language: string | null
          default_meal_plan: string | null
          include_transport: boolean | null
          include_guide: boolean | null
          include_entrances: boolean | null
          include_meals: boolean | null
          include_accommodation: boolean | null
          include_tips: boolean | null
          include_water: boolean | null
          default_margin_percent: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          template_id: string
          default_vehicle_id?: string | null
          default_guide_language?: string | null
          default_meal_plan?: string | null
          include_transport?: boolean | null
          include_guide?: boolean | null
          include_entrances?: boolean | null
          include_meals?: boolean | null
          include_accommodation?: boolean | null
          include_tips?: boolean | null
          include_water?: boolean | null
          default_margin_percent?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          template_id?: string
          default_vehicle_id?: string | null
          default_guide_language?: string | null
          default_meal_plan?: string | null
          include_transport?: boolean | null
          include_guide?: boolean | null
          include_entrances?: boolean | null
          include_meals?: boolean | null
          include_accommodation?: boolean | null
          include_tips?: boolean | null
          include_water?: boolean | null
          default_margin_percent?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_template_defaults_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tour_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_template_versions: {
        Row: {
          id: string
          template_id: string
          language: string
          template_name: string
          short_description: string | null
          long_description: string | null
          highlights: string[] | null
          main_attractions: string[] | null
          best_for: string[] | null
          inclusions: string[] | null
          exclusions: string[] | null
          itinerary: Json | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          template_id: string
          language: string
          template_name: string
          short_description?: string | null
          long_description?: string | null
          highlights?: string[] | null
          main_attractions?: string[] | null
          best_for?: string[] | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          itinerary?: Json | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          template_id?: string
          language?: string
          template_name?: string
          short_description?: string | null
          long_description?: string | null
          highlights?: string[] | null
          main_attractions?: string[] | null
          best_for?: string[] | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          itinerary?: Json | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tour_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_templates: {
        Row: {
          id: string
          template_code: string
          template_name: string
          category_id: string | null
          tour_type: string
          duration_days: number
          duration_nights: number | null
          primary_destination_id: string | null
          destinations_covered: string[] | null
          cities_covered: string[] | null
          short_description: string | null
          long_description: string | null
          highlights: string[] | null
          main_attractions: string[] | null
          best_for: string[] | null
          physical_level: string | null
          age_suitability: string | null
          pickup_required: boolean | null
          accommodation_nights: number | null
          meals_included: string[] | null
          image_url: string | null
          gallery_urls: string[] | null
          is_featured: boolean | null
          is_active: boolean | null
          popularity_score: number | null
          created_at: string | null
          updated_at: string | null
          default_transportation_service: string | null
          transportation_city: string | null
          pricing_mode: string | null
          uses_day_builder: boolean | null
          inclusions: string[] | null
          exclusions: string[] | null
          itinerary: Json | null
          cached_starting_price: number | null
          cached_starting_tier: string | null
          cached_price_updated_at: string | null
          hotels: Json
        }
        Insert: {
          id?: string
          template_code: string
          template_name: string
          category_id?: string | null
          tour_type: string
          duration_days: number
          duration_nights?: number | null
          primary_destination_id?: string | null
          destinations_covered?: string[] | null
          cities_covered?: string[] | null
          short_description?: string | null
          long_description?: string | null
          highlights?: string[] | null
          main_attractions?: string[] | null
          best_for?: string[] | null
          physical_level?: string | null
          age_suitability?: string | null
          pickup_required?: boolean | null
          accommodation_nights?: number | null
          meals_included?: string[] | null
          image_url?: string | null
          gallery_urls?: string[] | null
          is_featured?: boolean | null
          is_active?: boolean | null
          popularity_score?: number | null
          created_at?: string | null
          updated_at?: string | null
          default_transportation_service?: string | null
          transportation_city?: string | null
          pricing_mode?: string | null
          uses_day_builder?: boolean | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          itinerary?: Json | null
          cached_starting_price?: number | null
          cached_starting_tier?: string | null
          cached_price_updated_at?: string | null
          hotels: Json
        }
        Update: {
          id?: string
          template_code?: string
          template_name?: string
          category_id?: string | null
          tour_type?: string
          duration_days?: number
          duration_nights?: number | null
          primary_destination_id?: string | null
          destinations_covered?: string[] | null
          cities_covered?: string[] | null
          short_description?: string | null
          long_description?: string | null
          highlights?: string[] | null
          main_attractions?: string[] | null
          best_for?: string[] | null
          physical_level?: string | null
          age_suitability?: string | null
          pickup_required?: boolean | null
          accommodation_nights?: number | null
          meals_included?: string[] | null
          image_url?: string | null
          gallery_urls?: string[] | null
          is_featured?: boolean | null
          is_active?: boolean | null
          popularity_score?: number | null
          created_at?: string | null
          updated_at?: string | null
          default_transportation_service?: string | null
          transportation_city?: string | null
          pricing_mode?: string | null
          uses_day_builder?: boolean | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          itinerary?: Json | null
          cached_starting_price?: number | null
          cached_starting_tier?: string | null
          cached_price_updated_at?: string | null
          hotels?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tour_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tour_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_templates_primary_destination_id_fkey"
            columns: ["primary_destination_id"]
            isOneToOne: false
            referencedRelation: "destinations_legacy_2025"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_templates_with_languages: {
        Row: {
          id: string | null
          template_code: string | null
          template_name: string | null
          category_id: string | null
          tour_type: string | null
          duration_days: number | null
          duration_nights: number | null
          primary_destination_id: string | null
          destinations_covered: string[] | null
          cities_covered: string[] | null
          short_description: string | null
          long_description: string | null
          highlights: string[] | null
          main_attractions: string[] | null
          best_for: string[] | null
          physical_level: string | null
          age_suitability: string | null
          pickup_required: boolean | null
          accommodation_nights: number | null
          meals_included: string[] | null
          image_url: string | null
          gallery_urls: string[] | null
          is_featured: boolean | null
          is_active: boolean | null
          popularity_score: number | null
          created_at: string | null
          updated_at: string | null
          default_transportation_service: string | null
          transportation_city: string | null
          pricing_mode: string | null
          uses_day_builder: boolean | null
          inclusions: string[] | null
          exclusions: string[] | null
          itinerary: Json | null
          available_languages: string[] | null
          version_count: number | null
        }
        Insert: {
          id?: string | null
          template_code?: string | null
          template_name?: string | null
          category_id?: string | null
          tour_type?: string | null
          duration_days?: number | null
          duration_nights?: number | null
          primary_destination_id?: string | null
          destinations_covered?: string[] | null
          cities_covered?: string[] | null
          short_description?: string | null
          long_description?: string | null
          highlights?: string[] | null
          main_attractions?: string[] | null
          best_for?: string[] | null
          physical_level?: string | null
          age_suitability?: string | null
          pickup_required?: boolean | null
          accommodation_nights?: number | null
          meals_included?: string[] | null
          image_url?: string | null
          gallery_urls?: string[] | null
          is_featured?: boolean | null
          is_active?: boolean | null
          popularity_score?: number | null
          created_at?: string | null
          updated_at?: string | null
          default_transportation_service?: string | null
          transportation_city?: string | null
          pricing_mode?: string | null
          uses_day_builder?: boolean | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          itinerary?: Json | null
          available_languages?: string[] | null
          version_count?: number | null
        }
        Update: {
          id?: string | null
          template_code?: string | null
          template_name?: string | null
          category_id?: string | null
          tour_type?: string | null
          duration_days?: number | null
          duration_nights?: number | null
          primary_destination_id?: string | null
          destinations_covered?: string[] | null
          cities_covered?: string[] | null
          short_description?: string | null
          long_description?: string | null
          highlights?: string[] | null
          main_attractions?: string[] | null
          best_for?: string[] | null
          physical_level?: string | null
          age_suitability?: string | null
          pickup_required?: boolean | null
          accommodation_nights?: number | null
          meals_included?: string[] | null
          image_url?: string | null
          gallery_urls?: string[] | null
          is_featured?: boolean | null
          is_active?: boolean | null
          popularity_score?: number | null
          created_at?: string | null
          updated_at?: string | null
          default_transportation_service?: string | null
          transportation_city?: string | null
          pricing_mode?: string | null
          uses_day_builder?: boolean | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          itinerary?: Json | null
          available_languages?: string[] | null
          version_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_templates_with_languages_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tour_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_templates_with_languages_primary_destination_id_fkey"
            columns: ["primary_destination_id"]
            isOneToOne: false
            referencedRelation: "destinations_legacy_2025"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_variation_services: {
        Row: {
          id: string
          variation_id: string
          service_name: string
          service_category: string
          rate_type: string | null
          rate_id: string | null
          quantity_mode: string | null
          quantity_value: number | null
          quantity_type: string | null
          cost_per_unit: number | null
          day_number: number | null
          sequence_order: number | null
          is_optional: boolean | null
          optional_price_override: number | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          variation_id: string
          service_name: string
          service_category: string
          rate_type?: string | null
          rate_id?: string | null
          quantity_mode?: string | null
          quantity_value?: number | null
          quantity_type?: string | null
          cost_per_unit?: number | null
          day_number?: number | null
          sequence_order?: number | null
          is_optional?: boolean | null
          optional_price_override?: number | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          variation_id?: string
          service_name?: string
          service_category?: string
          rate_type?: string | null
          rate_id?: string | null
          quantity_mode?: string | null
          quantity_value?: number | null
          quantity_type?: string | null
          cost_per_unit?: number | null
          day_number?: number | null
          sequence_order?: number | null
          is_optional?: boolean | null
          optional_price_override?: number | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_variation_services_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_variation_versions: {
        Row: {
          id: string
          variation_id: string
          language: string
          variation_name: string
          inclusions: string[] | null
          exclusions: string[] | null
          optional_extras: string[] | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          variation_id: string
          language: string
          variation_name: string
          inclusions?: string[] | null
          exclusions?: string[] | null
          optional_extras?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          variation_id?: string
          language?: string
          variation_name?: string
          inclusions?: string[] | null
          exclusions?: string[] | null
          optional_extras?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_variation_versions_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_variations: {
        Row: {
          id: string
          template_id: string | null
          variation_code: string
          variation_name: string
          tier: string
          group_type: string
          min_pax: number
          max_pax: number
          optimal_pax: number | null
          inclusions: string[]
          exclusions: string[]
          optional_extras: string[] | null
          guide_type: string | null
          guide_languages: string[] | null
          vehicle_type: string | null
          accommodation_standard: string | null
          meal_quality: string | null
          private_experience: boolean | null
          skip_line_access: boolean | null
          vip_treatment: boolean | null
          flexible_itinerary: boolean | null
          typical_start_time: string | null
          typical_end_time: string | null
          pickup_time_range: string | null
          is_active: boolean | null
          available_seasons: string[] | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          template_id?: string | null
          variation_code: string
          variation_name: string
          tier: string
          group_type: string
          min_pax?: number
          max_pax?: number
          optimal_pax?: number | null
          inclusions: string[]
          exclusions: string[]
          optional_extras?: string[] | null
          guide_type?: string | null
          guide_languages?: string[] | null
          vehicle_type?: string | null
          accommodation_standard?: string | null
          meal_quality?: string | null
          private_experience?: boolean | null
          skip_line_access?: boolean | null
          vip_treatment?: boolean | null
          flexible_itinerary?: boolean | null
          typical_start_time?: string | null
          typical_end_time?: string | null
          pickup_time_range?: string | null
          is_active?: boolean | null
          available_seasons?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          template_id?: string | null
          variation_code?: string
          variation_name?: string
          tier?: string
          group_type?: string
          min_pax?: number
          max_pax?: number
          optimal_pax?: number | null
          inclusions?: string[]
          exclusions?: string[]
          optional_extras?: string[] | null
          guide_type?: string | null
          guide_languages?: string[] | null
          vehicle_type?: string | null
          accommodation_standard?: string | null
          meal_quality?: string | null
          private_experience?: boolean | null
          skip_line_access?: boolean | null
          vip_treatment?: boolean | null
          flexible_itinerary?: boolean | null
          typical_start_time?: string | null
          typical_end_time?: string | null
          pickup_time_range?: string | null
          is_active?: boolean | null
          available_seasons?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_variations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tour_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          id: string
          tour_code: string
          tour_name: string
          duration_days: number
          cities: string[]
          tour_type: string | null
          is_template: boolean | null
          description: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tour_code: string
          tour_name: string
          duration_days: number
          cities: string[]
          tour_type?: string | null
          is_template?: boolean | null
          description?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tour_code?: string
          tour_name?: string
          duration_days?: number
          cities?: string[]
          tour_type?: string | null
          is_template?: boolean | null
          description?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      train_rates: {
        Row: {
          id: string
          service_code: string
          origin_city: string | null
          destination_city: string | null
          class_type: string | null
          rate_eur: number | null
          duration_hours: number | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          operator_name: string | null
          is_active: boolean | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          description: string | null
          departure_times: string | null
          supplier_id: string | null
          rate_currency: string | null
          property_id: string | null
        }
        Insert: {
          id?: string
          service_code: string
          origin_city?: string | null
          destination_city?: string | null
          class_type?: string | null
          rate_eur?: number | null
          duration_hours?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          operator_name?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          departure_times?: string | null
          supplier_id?: string | null
          rate_currency?: string | null
          property_id?: string | null
        }
        Update: {
          id?: string
          service_code?: string
          origin_city?: string | null
          destination_city?: string | null
          class_type?: string | null
          rate_eur?: number | null
          duration_hours?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          operator_name?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          departure_times?: string | null
          supplier_id?: string | null
          rate_currency?: string | null
          property_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "train_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "train_rates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "supplier_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      transportation_contacts: {
        Row: {
          id: string
          name: string
          service_type: string | null
          vehicle_type: string | null
          city: string | null
          contact_person: string | null
          email: string | null
          phone: string | null
          whatsapp: string | null
          capacity: number | null
          daily_rate: number | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          phone2: string | null
          vehicle_types: string[] | null
        }
        Insert: {
          id?: string
          name: string
          service_type?: string | null
          vehicle_type?: string | null
          city?: string | null
          contact_person?: string | null
          email?: string | null
          phone?: string | null
          whatsapp?: string | null
          capacity?: number | null
          daily_rate?: number | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          phone2?: string | null
          vehicle_types?: string[] | null
        }
        Update: {
          id?: string
          name?: string
          service_type?: string | null
          vehicle_type?: string | null
          city?: string | null
          contact_person?: string | null
          email?: string | null
          phone?: string | null
          whatsapp?: string | null
          capacity?: number | null
          daily_rate?: number | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          phone2?: string | null
          vehicle_types?: string[] | null
        }
        Relationships: []
      }
      transportation_rates: {
        Row: {
          id: string
          service_code: string
          service_type: string
          vehicle_type: string | null
          capacity_min: number | null
          capacity_max: number | null
          city: string | null
          base_rate_eur: number | null
          base_rate_non_eur: number | null
          season: string | null
          rate_valid_from: string
          rate_valid_to: string
          supplier_name: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          origin_city: string | null
          destination_city: string | null
          supplier_id: string | null
          duration: string | null
          area: string | null
          sedan_rate_eur: number | null
          sedan_rate_non_eur: number | null
          minivan_rate_eur: number | null
          minivan_rate_non_eur: number | null
          van_rate_eur: number | null
          van_rate_non_eur: number | null
          minibus_rate_eur: number | null
          minibus_rate_non_eur: number | null
          bus_rate_eur: number | null
          bus_rate_non_eur: number | null
          sedan_capacity_min: number | null
          sedan_capacity_max: number | null
          minivan_capacity_min: number | null
          minivan_capacity_max: number | null
          van_capacity_min: number | null
          van_capacity_max: number | null
          minibus_capacity_min: number | null
          minibus_capacity_max: number | null
          bus_capacity_min: number | null
          bus_capacity_max: number | null
          route_name: string | null
          includes: string | null
          rate_currency: string | null
        }
        Insert: {
          id?: string
          service_code: string
          service_type: string
          vehicle_type?: string | null
          capacity_min?: number | null
          capacity_max?: number | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          season?: string | null
          rate_valid_from: string
          rate_valid_to: string
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          origin_city?: string | null
          destination_city?: string | null
          supplier_id?: string | null
          duration?: string | null
          area?: string | null
          sedan_rate_eur?: number | null
          sedan_rate_non_eur?: number | null
          minivan_rate_eur?: number | null
          minivan_rate_non_eur?: number | null
          van_rate_eur?: number | null
          van_rate_non_eur?: number | null
          minibus_rate_eur?: number | null
          minibus_rate_non_eur?: number | null
          bus_rate_eur?: number | null
          bus_rate_non_eur?: number | null
          sedan_capacity_min?: number | null
          sedan_capacity_max?: number | null
          minivan_capacity_min?: number | null
          minivan_capacity_max?: number | null
          van_capacity_min?: number | null
          van_capacity_max?: number | null
          minibus_capacity_min?: number | null
          minibus_capacity_max?: number | null
          bus_capacity_min?: number | null
          bus_capacity_max?: number | null
          route_name?: string | null
          includes?: string | null
          rate_currency?: string | null
        }
        Update: {
          id?: string
          service_code?: string
          service_type?: string
          vehicle_type?: string | null
          capacity_min?: number | null
          capacity_max?: number | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          season?: string | null
          rate_valid_from?: string
          rate_valid_to?: string
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          origin_city?: string | null
          destination_city?: string | null
          supplier_id?: string | null
          duration?: string | null
          area?: string | null
          sedan_rate_eur?: number | null
          sedan_rate_non_eur?: number | null
          minivan_rate_eur?: number | null
          minivan_rate_non_eur?: number | null
          van_rate_eur?: number | null
          van_rate_non_eur?: number | null
          minibus_rate_eur?: number | null
          minibus_rate_non_eur?: number | null
          bus_rate_eur?: number | null
          bus_rate_non_eur?: number | null
          sedan_capacity_min?: number | null
          sedan_capacity_max?: number | null
          minivan_capacity_min?: number | null
          minivan_capacity_max?: number | null
          van_capacity_min?: number | null
          van_capacity_max?: number | null
          minibus_capacity_min?: number | null
          minibus_capacity_max?: number | null
          bus_capacity_min?: number | null
          bus_capacity_max?: number | null
          route_name?: string | null
          includes?: string | null
          rate_currency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transportation_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_conversations: {
        Row: {
          id: string | null
          channel: string | null
          identifier: string | null
          client_id: string | null
          client_name: string | null
          client_email: string | null
          contact_info: string | null
          subject: string | null
          last_message_snippet: string | null
          last_message_at: string | null
          unread_count: number | null
          status: string | null
          assigned_team_member_id: string | null
          assigned_at: string | null
          created_at: string | null
          updated_at: string | null
          is_hidden: boolean | null
        }
        Insert: {
          id?: string | null
          channel?: string | null
          identifier?: string | null
          client_id?: string | null
          client_name?: string | null
          client_email?: string | null
          contact_info?: string | null
          subject?: string | null
          last_message_snippet?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          status?: string | null
          assigned_team_member_id?: string | null
          assigned_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_hidden?: boolean | null
        }
        Update: {
          id?: string | null
          channel?: string | null
          identifier?: string | null
          client_id?: string | null
          client_name?: string | null
          client_email?: string | null
          contact_info?: string | null
          subject?: string | null
          last_message_snippet?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          status?: string | null
          assigned_team_member_id?: string | null
          assigned_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_hidden?: boolean | null
        }
        Relationships: []
      }
      user_activity_summary: {
        Row: {
          user_id: string | null
          user_email: string | null
          total_actions: number | null
          creates: number | null
          updates: number | null
          deletes: number | null
          failed_actions: number | null
          last_activity: string | null
        }
        Insert: {
          user_id?: string | null
          user_email?: string | null
          total_actions?: number | null
          creates?: number | null
          updates?: number | null
          deletes?: number | null
          failed_actions?: number | null
          last_activity?: string | null
        }
        Update: {
          user_id?: string | null
          user_email?: string | null
          total_actions?: number | null
          creates?: number | null
          updates?: number | null
          deletes?: number | null
          failed_actions?: number | null
          last_activity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_summary_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          id: string
          email: string
          role: string
          invited_by: string | null
          token: string
          expires_at: string
          accepted_at: string | null
          created_at: string | null
          org_id: string
        }
        Insert: {
          id?: string
          email: string
          role?: string
          invited_by?: string | null
          token: string
          expires_at: string
          accepted_at?: string | null
          created_at?: string | null
          org_id: string
        }
        Update: {
          id?: string
          email?: string
          role?: string
          invited_by?: string | null
          token?: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          id: string
          user_id: string
          default_cost_mode: string | null
          default_tier: string | null
          default_margin_percent: number | null
          default_currency: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          default_cost_mode?: string | null
          default_tier?: string | null
          default_margin_percent?: number | null
          default_currency?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          default_cost_mode?: string | null
          default_tier?: string | null
          default_margin_percent?: number | null
          default_currency?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: string | null
          company_name: string | null
          phone: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          avatar_url: string | null
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: string | null
          company_name?: string | null
          phone?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          avatar_url?: string | null
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          role?: string | null
          company_name?: string | null
          phone?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          avatar_url?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          id: string
          user_id: string | null
          notification_preferences: Json | null
          email_settings: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          notification_preferences?: Json | null
          email_settings?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          notification_preferences?: Json | null
          email_settings?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      v_daily_services: {
        Row: {
          day_id: string | null
          itinerary_id: string | null
          day_number: number | null
          date: string | null
          city: string | null
          title: string | null
          service_id: string | null
          service_type: string | null
          service_name: string | null
          quantity: number | null
          total_cost: number | null
        }
        Insert: {
          day_id?: string | null
          itinerary_id?: string | null
          day_number?: number | null
          date?: string | null
          city?: string | null
          title?: string | null
          service_id?: string | null
          service_type?: string | null
          service_name?: string | null
          quantity?: number | null
          total_cost?: number | null
        }
        Update: {
          day_id?: string | null
          itinerary_id?: string | null
          day_number?: number | null
          date?: string | null
          city?: string | null
          title?: string | null
          service_id?: string | null
          service_type?: string | null
          service_name?: string | null
          quantity?: number | null
          total_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "v_daily_services_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      v_itineraries_summary: {
        Row: {
          id: string | null
          itinerary_code: string | null
          client_name: string | null
          client_email: string | null
          trip_name: string | null
          start_date: string | null
          end_date: string | null
          total_days: number | null
          num_adults: number | null
          num_children: number | null
          currency: string | null
          total_cost: number | null
          status: string | null
          days_planned: number | null
          services_count: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string | null
          itinerary_code?: string | null
          client_name?: string | null
          client_email?: string | null
          trip_name?: string | null
          start_date?: string | null
          end_date?: string | null
          total_days?: number | null
          num_adults?: number | null
          num_children?: number | null
          currency?: string | null
          total_cost?: number | null
          status?: string | null
          days_planned?: number | null
          services_count?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string | null
          itinerary_code?: string | null
          client_name?: string | null
          client_email?: string | null
          trip_name?: string | null
          start_date?: string | null
          end_date?: string | null
          total_days?: number | null
          num_adults?: number | null
          num_children?: number | null
          currency?: string | null
          total_cost?: number | null
          status?: string | null
          days_planned?: number | null
          services_count?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      variation_daily_itinerary: {
        Row: {
          id: string
          variation_id: string | null
          day_number: number
          day_title: string | null
          day_description: string | null
          city: string | null
          overnight_city: string | null
          activities: string[] | null
          attractions: string[] | null
          breakfast_included: boolean | null
          lunch_included: boolean | null
          dinner_included: boolean | null
          start_time: string | null
          end_time: string | null
          created_at: string | null
          is_cruise_day: boolean | null
        }
        Insert: {
          id?: string
          variation_id?: string | null
          day_number: number
          day_title?: string | null
          day_description?: string | null
          city?: string | null
          overnight_city?: string | null
          activities?: string[] | null
          attractions?: string[] | null
          breakfast_included?: boolean | null
          lunch_included?: boolean | null
          dinner_included?: boolean | null
          start_time?: string | null
          end_time?: string | null
          created_at?: string | null
          is_cruise_day?: boolean | null
        }
        Update: {
          id?: string
          variation_id?: string | null
          day_number?: number
          day_title?: string | null
          day_description?: string | null
          city?: string | null
          overnight_city?: string | null
          activities?: string[] | null
          attractions?: string[] | null
          breakfast_included?: boolean | null
          lunch_included?: boolean | null
          dinner_included?: boolean | null
          start_time?: string | null
          end_time?: string | null
          created_at?: string | null
          is_cruise_day?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "variation_daily_itinerary_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      variation_pricing: {
        Row: {
          id: string
          variation_id: string | null
          min_pax: number
          max_pax: number
          price_per_person: number | null
          total_group_price: number | null
          single_supplement: number | null
          child_price_per_person: number | null
          child_age_range: string | null
          base_cost: number | null
          markup_percentage: number | null
          final_price: number | null
          season: string | null
          valid_from: string | null
          valid_to: string | null
          currency: string | null
          pricing_notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          variation_id?: string | null
          min_pax: number
          max_pax: number
          price_per_person?: number | null
          total_group_price?: number | null
          single_supplement?: number | null
          child_price_per_person?: number | null
          child_age_range?: string | null
          base_cost?: number | null
          markup_percentage?: number | null
          final_price?: number | null
          season?: string | null
          valid_from?: string | null
          valid_to?: string | null
          currency?: string | null
          pricing_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          variation_id?: string | null
          min_pax?: number
          max_pax?: number
          price_per_person?: number | null
          total_group_price?: number | null
          single_supplement?: number | null
          child_price_per_person?: number | null
          child_age_range?: string | null
          base_cost?: number | null
          markup_percentage?: number | null
          final_price?: number | null
          season?: string | null
          valid_from?: string | null
          valid_to?: string | null
          currency?: string | null
          pricing_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variation_pricing_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      variation_services: {
        Row: {
          id: string
          variation_id: string | null
          service_category: string
          service_code: string | null
          service_name: string
          service_description: string | null
          applies_to_day: number | null
          quantity_type: string
          base_quantity: number | null
          cost_per_unit: number
          currency: string | null
          cost_calculation_notes: string | null
          is_mandatory: boolean | null
          is_optional_extra: boolean | null
          extra_cost: number | null
          provider_name: string | null
          provider_contact: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          variation_id?: string | null
          service_category: string
          service_code?: string | null
          service_name: string
          service_description?: string | null
          applies_to_day?: number | null
          quantity_type: string
          base_quantity?: number | null
          cost_per_unit: number
          currency?: string | null
          cost_calculation_notes?: string | null
          is_mandatory?: boolean | null
          is_optional_extra?: boolean | null
          extra_cost?: number | null
          provider_name?: string | null
          provider_contact?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          variation_id?: string | null
          service_category?: string
          service_code?: string | null
          service_name?: string
          service_description?: string | null
          applies_to_day?: number | null
          quantity_type?: string
          base_quantity?: number | null
          cost_per_unit?: number
          currency?: string | null
          cost_calculation_notes?: string | null
          is_mandatory?: boolean | null
          is_optional_extra?: boolean | null
          extra_cost?: number | null
          provider_name?: string | null
          provider_contact?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variation_services_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_rates: {
        Row: {
          id: string
          vehicle_type: string
          min_pax: number
          max_pax: number
          cost_per_day: number
          is_active: boolean | null
          created_at: string | null
          supplier_id: string | null
        }
        Insert: {
          id?: string
          vehicle_type: string
          min_pax: number
          max_pax: number
          cost_per_day: number
          is_active?: boolean | null
          created_at?: string | null
          supplier_id?: string | null
        }
        Update: {
          id?: string
          vehicle_type?: string
          min_pax?: number
          max_pax?: number
          cost_per_day?: number
          is_active?: boolean | null
          created_at?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          id: string
          name: string
          vehicle_type: string
          make: string | null
          model: string | null
          year: number | null
          license_plate: string | null
          registration_number: string | null
          passenger_capacity: number
          has_ac: boolean | null
          has_wifi: boolean | null
          is_luxury: boolean | null
          is_active: boolean | null
          current_mileage: number | null
          last_service_date: string | null
          next_service_date: string | null
          insurance_expiry: string | null
          daily_rate: number | null
          rate_per_km: number | null
          default_driver_name: string | null
          default_driver_phone: string | null
          notes: string | null
          photo_url: string | null
          created_at: string | null
          updated_at: string | null
          tier: string | null
          is_preferred: boolean | null
          city: string | null
        }
        Insert: {
          id?: string
          name: string
          vehicle_type: string
          make?: string | null
          model?: string | null
          year?: number | null
          license_plate?: string | null
          registration_number?: string | null
          passenger_capacity: number
          has_ac?: boolean | null
          has_wifi?: boolean | null
          is_luxury?: boolean | null
          is_active?: boolean | null
          current_mileage?: number | null
          last_service_date?: string | null
          next_service_date?: string | null
          insurance_expiry?: string | null
          daily_rate?: number | null
          rate_per_km?: number | null
          default_driver_name?: string | null
          default_driver_phone?: string | null
          notes?: string | null
          photo_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          city?: string | null
        }
        Update: {
          id?: string
          name?: string
          vehicle_type?: string
          make?: string | null
          model?: string | null
          year?: number | null
          license_plate?: string | null
          registration_number?: string | null
          passenger_capacity?: number
          has_ac?: boolean | null
          has_wifi?: boolean | null
          is_luxury?: boolean | null
          is_active?: boolean | null
          current_mileage?: number | null
          last_service_date?: string | null
          next_service_date?: string | null
          insurance_expiry?: string | null
          daily_rate?: number | null
          rate_per_km?: number | null
          default_driver_name?: string | null
          default_driver_phone?: string | null
          notes?: string | null
          photo_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          city?: string | null
        }
        Relationships: []
      }
      whatsapp_conversations: {
        Row: {
          id: string
          phone_number: string
          client_id: string | null
          client_name: string | null
          last_message: string | null
          last_message_at: string | null
          unread_count: number | null
          status: string | null
          created_at: string | null
          updated_at: string | null
          is_hidden: boolean | null
          hidden_at: string | null
          hidden_by: string | null
          assigned_agent_id: string | null
          assigned_at: string | null
          last_agent_reply_at: string | null
          last_agent_id: string | null
          assigned_team_member_id: string | null
          ai_draft_reply: string | null
          ai_draft_confidence: number | null
          ai_draft_escalate: boolean
          ai_draft_generated_at: string | null
        }
        Insert: {
          id?: string
          phone_number: string
          client_id?: string | null
          client_name?: string | null
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_hidden?: boolean | null
          hidden_at?: string | null
          hidden_by?: string | null
          assigned_agent_id?: string | null
          assigned_at?: string | null
          last_agent_reply_at?: string | null
          last_agent_id?: string | null
          assigned_team_member_id?: string | null
          ai_draft_reply?: string | null
          ai_draft_confidence?: number | null
          ai_draft_escalate?: boolean
          ai_draft_generated_at?: string | null
        }
        Update: {
          id?: string
          phone_number?: string
          client_id?: string | null
          client_name?: string | null
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_hidden?: boolean | null
          hidden_at?: string | null
          hidden_by?: string | null
          assigned_agent_id?: string | null
          assigned_at?: string | null
          last_agent_reply_at?: string | null
          last_agent_id?: string | null
          assigned_team_member_id?: string | null
          ai_draft_reply?: string | null
          ai_draft_confidence?: number | null
          ai_draft_escalate?: boolean
          ai_draft_generated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_assigned_team_member_id_fkey"
            columns: ["assigned_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          id: string
          conversation_id: string | null
          message_sid: string | null
          direction: string
          message_body: string | null
          media_url: string | null
          media_type: string | null
          status: string | null
          error_message: string | null
          sent_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          conversation_id?: string | null
          message_sid?: string | null
          direction: string
          message_body?: string | null
          media_url?: string | null
          media_type?: string | null
          status?: string | null
          error_message?: string | null
          sent_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string | null
          message_sid?: string | null
          direction?: string
          message_body?: string | null
          media_url?: string | null
          media_type?: string | null
          status?: string | null
          error_message?: string | null
          sent_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      writing_rules: {
        Row: {
          id: string
          name: string
          category: string
          rule_type: string
          description: string
          examples: Json | null
          priority: number | null
          is_active: boolean | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          applies_to: string[] | null
          destination_id: string | null
        }
        Insert: {
          id?: string
          name: string
          category: string
          rule_type: string
          description: string
          examples?: Json | null
          priority?: number | null
          is_active?: boolean | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          applies_to?: string[] | null
          destination_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          category?: string
          rule_type?: string
          description?: string
          examples?: Json | null
          priority?: number | null
          is_active?: boolean | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          applies_to?: string[] | null
          destination_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "writing_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_rules_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    // NOTE: must be `{ [_ in never]: never }`, NOT `Record<string, never>`.
    // Record's string index signature makes `keyof Functions` = string, which
    // postgrest-js reads as "every column is a computed field" — collapsing
    // every select('*') result to {}.
    Views: { [_ in never]: never }
    Functions: {
      assign_conversation: {
        Args: {
          p_action_type?: string
          p_agent_id?: string
          p_assigned_by?: string
          p_conversation_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      bump_whatsapp_conversation: {
        Args: {
          p_conversation_id?: string
          p_last_message?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      calculate_next_reminder_date: {
        Args: {
          p_due_date?: string
          p_last_reminder_sent?: string
          p_reminder_count?: number
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      cleanup_old_audit_logs: {
        Args: {
          days_to_keep?: number
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      create_b2c_quote_revision: {
        Args: {
          p_change_reason?: string
          p_changed_by?: string
          p_quote_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      create_quote_revision: {
        Args: {
          p_change_reason?: string
          p_changed_by?: string
          p_quote_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      delete_client_safely: {
        Args: {
          client_uuid?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      fn_rate_audit_actor: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      generate_booking_code: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      generate_document_number: {
        Args: {
          doc_type?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      get_next_available_agent: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      get_org_agent_memories: {
        Args: {
          p_limit?: number
          p_min_confidence?: number
          p_org_id?: string
          p_subject_id?: string
          p_subject_type?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      get_user_role: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      is_active_user: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      is_agent_or_above: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      is_manager_or_above: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      log_audit: {
        Args: {
          p_action?: string
          p_error_message?: string
          p_metadata?: Json
          p_new_data?: Json
          p_old_data?: Json
          p_record_id?: string
          p_status?: string
          p_table_name?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      match_copilot_knowledge: {
        Args: {
          p_match_count?: number
          p_org_id?: string
          p_query_embedding?: string
          p_source_types?: string[]
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      purge_expired_agent_memories: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      recompute_client_revenue: {
        Args: {
          p_client?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      record_booking_payment: {
        Args: {
          p_amount?: number
          p_booking_id?: string
          p_currency?: string
          p_notes?: string
          p_payment_date?: string
          p_payment_method?: string
          p_payment_type?: string
          p_transaction_reference?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      revert_b2c_quote_to_revision: {
        Args: {
          p_quote_id?: string
          p_revert_reason?: string
          p_reverted_by?: string
          p_version_number?: number
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      revert_quote_to_revision: {
        Args: {
          p_quote_id?: string
          p_revert_reason?: string
          p_reverted_by?: string
          p_version_number?: number
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      save_pricing_grid_days: {
        Args: {
          p_days?: Json
          p_itinerary_id?: string
          p_services?: Json
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      user_is_in_org: {
        Args: {
          p_org_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      user_is_org_owner: {
        Args: {
          p_org_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
