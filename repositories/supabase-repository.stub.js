/* Future adapter contract only. Intentionally not imported by the application and performs no connection. */
class SupabaseRepositoryStub extends RepositoryContract{
 constructor({client,table}){super();if(!client)throw new Error('A Supabase client must be injected in the production integration step');this.client=client;this.table=table}
 async list(){throw new Error('Supabase adapter is deliberately disabled in this demo')}
 async getById(){throw new Error('Supabase adapter is deliberately disabled in this demo')}
 async create(){throw new Error('Supabase adapter is deliberately disabled in this demo')}
 async update(){throw new Error('Supabase adapter is deliberately disabled in this demo')}
 async delete(){throw new Error('Supabase adapter is deliberately disabled in this demo')}
 async search(){throw new Error('Supabase adapter is deliberately disabled in this demo')}
 async filter(){throw new Error('Supabase adapter is deliberately disabled in this demo')}
}
