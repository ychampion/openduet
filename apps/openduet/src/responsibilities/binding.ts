import { sql } from 'drizzle-orm';
import type { Transaction } from '../db/transaction.ts';

/**
 * Result corrections are independent chats, but retain their source's mailbox
 * boundary. UNION deduplicates repeated references and cycles, and every hop
 * stays inside the original owner and space. `j` is the enclosing job alias.
 */
export const FOLLOWUP_SOURCE_JOB_IDS = `with recursive followup_lineage(id) as (
  select j.id
  union
  select source.id from followup_lineage lineage
    join job current_job on current_job.id = lineage.id
    cross join lateral (
      select current_job.experience_parent_id as id where current_job.experience_parent_id is not null
      union
      select reference.job_id from session_reference reference
        join personal_session session on session.id = reference.session_id
        where reference.discussion_id = current_job.id and reference.kind = 'result'
          and reference.job_id <> current_job.id
          and session.principal_id = j.principal_id and session.space_id = j.space_id
    ) parent
    join job source on source.id = parent.id
      and source.principal_id = j.principal_id and source.space_id = j.space_id
) select id from followup_lineage`;

/**
 * A direct persisted binding survives deletion of result-directory ancestry.
 * The original preparation lookup also supports directly seeded preparations.
 * Retaining a null preparation with its connection ID makes missing source fail
 * closed instead of quietly turning a scoped discussion into an ordinary chat.
 */
export const FOLLOWUP_BINDINGS = `select binding.preparation_id, binding.connection_id
  from customer_followup_binding binding where binding.job_id in (${FOLLOWUP_SOURCE_JOB_IDS})
  union
  select preparation.id, followup.connection_id
    from customer_followup_preparation preparation
    join customer_followup followup on followup.id = preparation.followup_id
    where preparation.conversation_id in (${FOLLOWUP_SOURCE_JOB_IDS})`;

/** Copy only an existing source fence; a result correction never grants new account access. */
export async function inheritFollowupBinding(
  tx: Transaction,
  sourceId: string,
  discussionId: string,
) {
  await tx.execute(sql`insert into customer_followup_binding (job_id, preparation_id, connection_id)
    select ${discussionId}, binding.preparation_id, binding.connection_id
      from job j cross join lateral (${sql.raw(FOLLOWUP_BINDINGS)}) binding
      join job discussion on discussion.id = ${discussionId}
        and discussion.space_id = j.space_id and discussion.principal_id = j.principal_id
      where j.id = ${sourceId}
    on conflict (job_id) do nothing`);
}
