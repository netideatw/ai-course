/* 報名資料存取層（Supabase）
   - 報名頁：直接以 REST 新增一筆報名，訪客沒有讀取權限
   - 網頁瀏覽／點擊事件：訪客只能新增，報表只有後台帳號能看
   - 後台：用 supabase-js 登入，admins 名單內的帳號能讀寫全部；推廣者只能看自己的成效
   anon key 是公開金鑰，資料安全由資料庫的 RLS 權限規則保護 */
window.RegDB = (function () {
  var URL = 'https://fxwakcipqmffbdnuyfpp.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4d2FrY2lwcW1mZmJkbnV5ZnBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3MDE5OTAsImV4cCI6MjEwOTI3Nzk5MH0.velFypGeIfv9pUYKTod68UkaK3wNw7Bk4TbpppzY4r4';
  var sb = null;
  function client() {
    if (!sb) {
      if (!window.supabase) throw new Error('supabase-js not loaded');
      sb = window.supabase.createClient(URL, KEY);
    }
    return sb;
  }
  function ok(res) { if (res.error) throw res.error; return res.data }
  function trashCall(fn, id) {
    return client().rpc(fn, { p_id: id }).then(function (res) {
      var e = res.error;
      if (!e) return;
      var m = e.message || '';
      if (/DUPLICATE_REGISTRATION/.test(m)) throw new Error('無法還原：此人已用相同 Email 或電話重新填寫了同一門課。');
      if (e.code === 'PGRST202' || /Could not find the function/i.test(m)) throw new Error('資料庫尚未啟用垃圾桶，請先執行 supabase/migrations/20261116_registration_trash.sql');
      throw new Error('操作失敗：' + m);
    });
  }
  // 呼叫函式，失敗時把伺服器的中文錯誤訊息帶出來
  function callAdmins(body, fn) {
    return client().functions.invoke(fn || 'manage-admins', { body: body }).then(function (res) {
      if (!res.error) return res.data;
      var ctx = res.error.context;
      return (ctx && ctx.json ? ctx.json() : Promise.resolve({})).then(function (j) {
        throw new Error((j && j.error) || '操作失敗，請稍後再試');
      }, function () { throw new Error('操作失敗，請稍後再試') });
    });
  }

  return {
    mode: 'live',

    add: function (rec) {
      var row = { batch: rec.batch, mode: rec.mode, name: rec.name, email: rec.email, phone: rec.phone, ref: rec.ref || null };
      return fetch(URL + '/rest/v1/registrations', {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(row)
      }).then(function (r) {
        if (r.ok) return;
        return r.text().then(function (t) { throw new Error(/DUPLICATE_REGISTRATION/.test(t) ? 'DUPLICATE' : 'HTTP ' + r.status) });
      });
    },


    // 後台寄通知信（只有管理員）
    broadcast: function (body) { return callAdmins(body, 'broadcast') },
    broadcasts: function () { return client().from('broadcasts').select('*').order('created_at', { ascending: false }).limit(30).then(ok) },
    broadcastCounts: function (id) {
      var c = client(), n = function (s) { return c.from('broadcast_recipients').select('id', { count: 'exact', head: true }).eq('broadcast_id', id).eq('status', s).then(function (x) { return x.count || 0 }) };
      return Promise.all([n('sent'), n('failed'), n('pending'), n('sending')]).then(function (a) { return { sent: a[0], failed: a[1], pending: a[2], sending: a[3] } });
    },
    broadcastFailures: function (id) { return client().from('broadcast_recipients').select('email,error').eq('broadcast_id', id).eq('status', 'failed').limit(50).then(ok) },

    // 課程報名開關（訪客可讀，只有管理員可改）
    batches: function () {
      return fetch(URL + '/rest/v1/batches?select=name,open&order=sort', { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() });
    },
    setBatchOpen: function (name, open) {
      return client().from('batches').update({ open: open }).eq('name', name).select('name,open').then(ok).then(function (rows) {
        if (!rows || !rows.length) throw new Error('沒有權限');
        return rows[0];
      });
    },

    // 登入身分：{ email, admin, promoter:{code,name}|null, apply:推廣者申請狀態, access }；未登入回傳 null
    role: function () {
      var c = client();
      return c.auth.getUser().then(function (u) {
        var user = u.data && u.data.user;
        if (!user) return null;
        return c.rpc('my_role').then(ok).then(function (r) {
          r = r || {};
          return { email: user.email, admin: !!r.admin, promoter: r.promoter || null, apply: r.apply || null, access: !!(r.admin || r.promoter) };
        });
      });
    },
    session: function () {
      var self = this;
      return client().auth.getSession().then(function (res) {
        if (!res.data || !res.data.session) return null;
        return self.role().then(function (r) { return r && r.access ? r : null });
      });
    },
    // 沒有後台權限時登出，並依推廣者申請狀態給出提示
    signIn: function (email, pw) {
      var c = client(), self = this;
      return c.auth.signInWithPassword({ email: email, password: pw }).then(ok).then(function () {
        return self.role().then(function (r) {
          if (r && r.access) return r;
          var msg = !r ? '' : r.apply === 'pending' ? '你的推廣者申請正在審核中，通過後會寄信通知你。'
            : r.apply === 'approved' ? '此推廣者帳號已停用，如有疑問請聯絡管理員。' : '';
          return c.auth.signOut().then(function () { var e = new Error(msg || 'no access'); e.friendly = !!msg; throw e });
        });
      });
    },
    // 推廣者自行註冊（送出後等管理員審核）
    signUpPromoter: function (rec) {
      return fetch(URL + '/functions/v1/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'promoter_signup', name: rec.name, email: rec.email, phone: rec.phone, note: rec.note, password: rec.password })
      }).then(function (r) {
        return r.json().catch(function () { return {} }).then(function (j) {
          if (!r.ok || !j.ok) throw new Error(j.error || '註冊失敗，請稍後再試');
        });
      });
    },
    // 管理員：推廣者申請（待審核在前）與審核
    applications: function () {
      return client().from('promoter_applications').select('*').order('created_at', { ascending: false }).then(ok);
    },
    // 管理員直接新增推廣者（或替既有推廣人加上登入 Email），系統寄設定密碼信給對方
    addPromoterAccount: function (code, name, email) {
      return callAdmins({ type: 'promoter_add', code: code, name: name, email: email, page: location.origin + location.pathname }, 'notify');
    },
    reviewApplication: function (id, decision, code, name) {
      return callAdmins({ type: 'promoter_review', id: id, decision: decision, code: code, name: name }, 'notify');
    },
    signOut: function () { return client().auth.signOut() },

    list: function () {
      return client().from('registrations').select('*').order('created_at', { ascending: false }).then(ok);
    },
    // 刪除＝移到垃圾桶；垃圾桶可還原或永久刪除（只有管理員）
    remove: function (id) { return trashCall('trash_registration', id) },
    trash: function () {
      return client().from('registrations_trash').select('*').order('deleted_at', { ascending: false }).then(function (res) {
        if (res.error && /registrations_trash/.test(res.error.message || '')) return [];
        return ok(res);
      });
    },
    restore: function (id) { return trashCall('restore_registration', id) },
    purge: function (id) { return trashCall('purge_registration', id) },
    promoters: function () { return client().from('promoters').select('code,name,email').order('created_at').then(ok) },
    savePromoter: function (p) { return client().from('promoters').upsert({ code: p.code, name: p.name }).then(ok) },
    removePromoter: function (code) { return client().from('promoters').delete().eq('code', code).then(ok) },
    // 管理員：報名者備註（空字串存成 null）
    setNote: function (id, note) {
      return client().from('registrations').update({ note: note || null }).eq('id', id).select('id,note').then(function (res) {
        if (res.error && /note/.test(res.error.message || '')) throw new Error('資料庫尚未加入備註欄位，請先執行 supabase/migrations/20261116_registration_note.sql');
        return ok(res);
      }).then(function (rows) {
        if (!rows || !rows.length) throw new Error('儲存失敗：沒有權限或資料已被刪除');
        return rows[0];
      });
    },

    // 管理員：名單可直接讀；新增／移除經由 manage-admins 函式（需要伺服器端權限）
    admins: function () { return client().from('admins').select('email,created_at,notify').order('created_at').then(ok) },
    setAdminNotify: function (email, on) { return client().from('admins').update({ notify: on }).eq('email', email).then(ok) },
    addAdmin: function (email, password) { return callAdmins({ action: 'add', email: email, password: password }) },
    removeAdmin: function (email) { return callAdmins({ action: 'remove', email: email }) },
    // 忘記密碼：請伺服器寄出重設信（不論是否為管理員都回應相同結果）
    forgot: function (email) {
      return fetch(URL + '/functions/v1/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'forgot', email: email, page: location.origin + location.pathname })
      });
    },
    // 用信中的 token 換得登入狀態，再設定新密碼
    recover: function (tokenHash) {
      return client().auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(ok).then(function (d) { return d.user.email });
    },
    setNewPassword: function (pw) {
      var c = client();
      return c.auth.updateUser({ password: pw }).then(function (r) {
        if (r.error) throw new Error(/should be different/i.test(r.error.message) ? '新密碼不能和舊密碼相同' : '更新失敗：' + r.error.message);
        return RegDB.role().then(function (role) {
          if (!role || !role.access) return c.auth.signOut().then(function () { throw new Error('此帳號沒有後台權限') });
          return role;
        });
      });
    },
    // 推廣者登入帳號：重設密碼／停用（帳號由推廣者自行註冊、管理員審核）
    resetPromoterPassword: function (code, password) { return callAdmins({ action: 'promoter_reset', code: code, password: password }) },
    unlinkPromoter: function (code) { return callAdmins({ action: 'promoter_unlink', code: code }) },
    // 推廣者：自己介紹的報名者（姓名已遮蔽）
    myReferrals: function () { return client().rpc('my_referrals').then(ok) },
    // 數據報表（日期 YYYY-MM-DD；ref：null 全部、'' 直接進站、其他為推廣代碼；推廣者固定只看自己）
    stats: function (from, to, ref) {
      return client().rpc('site_stats', { p_from: from, p_to: to, p_ref: ref == null ? null : ref }).then(ok);
    },
    // 網頁瀏覽／點擊事件（不等結果；keepalive 讓離開頁面時也能送出）
    track: function (ev) {
      var row = { type: ev.type, vid: ev.vid || null, ref: ev.ref || null, target: ev.target || null, src: ev.src || null, device: ev.device || null };
      try {
        fetch(URL + '/rest/v1/site_events', {
          method: 'POST', keepalive: true,
          headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(row)
        }).catch(function () {});
      } catch (e) {}
    },
    resetAdminPassword: function (email, password) { return callAdmins({ action: 'reset', email: email, password: password }) },
    // 先用目前密碼驗證身分，再更新為新密碼
    changePassword: function (email, current, pw) {
      var c = client();
      return c.auth.signInWithPassword({ email: email, password: current }).then(function (res) {
        if (res.error) throw new Error('目前密碼不正確');
        return c.auth.updateUser({ password: pw }).then(function (r) {
          if (r.error) throw new Error(/should be different/i.test(r.error.message) ? '新密碼不能和目前密碼相同' : '更新失敗：' + r.error.message);
        });
      });
    }
  };
})();
