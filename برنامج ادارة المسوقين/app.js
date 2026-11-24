const $ = s => document.querySelector(s);
const state = {
 page:'dashboard', role:'manager',
 customers:[], visits:[], sales:[], team:[], reservations:[], unconverted:[]
};
let currentUser=null;
const titles={dashboard:'نظرة عامة',customers:'قاعدة العملاء',visits:'الزيارات والحجوزات',unconverted:'العملاء الذين تم زيارتهم ولم يشتركوا',sales:'المبيعات والاشتراكات',commissions:'العمولات',team:'فريق التسويق',reports:'التقارير',settings:'الإعدادات'};
const money=n=>new Intl.NumberFormat('ar-YE').format(n||0)+' ر.ي';
const today=()=>new Date().toISOString().slice(0,10);
const persist=()=>{};
const toast=m=>{const el=$('#toast');el.textContent=m;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)};
const statusClass=s=>s==='تم البيع'?'green':s==='مرفوض'?'red':s==='تحت المتابعة'?'orange':'';
function setPage(p){state.page=p;$('#pageTitle').textContent=titles[p];document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===p));$('#sidebar').classList.remove('open');syncMarketerMobileNav();render()}
function render(){const root=$('#content');const pages={dashboard,customers,visits,unconverted,sales,commissions,team,reports,settings};root.innerHTML=(pages[state.page]||dashboard)()}
function pageIntro(title,desc,button=''){return '<div class="page-intro"><div><h2>'+title+'</h2><div class="muted small">'+desc+'</div></div>'+button+'</div>'}
function dashboard(){const c=state.customers.length,v=state.visits.length,s=state.sales.length,earned=state.sales.reduce((a,x)=>a+x.commission,0);return '<section class="welcome"><h2>مرحباً بك في لوحة إدارة المسوقين</h2><p>تابع العملاء والزيارات وفرص البيع والعمولات من مكان واحد. البيانات المعروضة تجريبية ومحفوظة على هذا المتصفح فقط.</p><div class="quick-links"><button class="primary-btn" onclick="openCustomer()">＋ إضافة عميل</button><button class="secondary-btn" onclick="setPage(\'visits\')">تسجيل زيارة</button><button class="secondary-btn" onclick="setPage(\'reports\')">عرض التقارير</button></div></section><div class="stats">'+stat('إجمالي العملاء',c,'♙','ضمن قاعدة الشركة')+stat('الزيارات المسجلة',v,'⌖','سجل الزيارات')+stat('المبيعات المعتمدة',s,'↗','عمليات بيع')+stat('العمولات المستحقة',money(earned),'◈','قبل تسجيل المدفوعات')+'</div><div class="grid-2"><section class="panel"><div class="panel-head"><h3>آخر العملاء</h3><button class="text-btn" onclick="setPage(\'customers\')">عرض الكل ←</button></div>'+customerTable(state.customers.slice(-4).reverse())+'</section><section class="panel"><div class="panel-head"><h3>ملخص الأداء</h3><span class="status">هذا الشهر</span></div><div class="activity">'+[['العملاء في قاعدة البيانات',c],['الزيارات المنفذة',v],['الاشتراكات المباعة',s],['أعضاء فريق التسويق',state.team.length]].map(x=>'<div class="activity-item"><i class="activity-dot"></i><div><b>'+x[0]+'</b><p>'+x[1]+' إجمالي</p></div></div>').join('')+'</div></section></div>'}
function stat(label,value,icon,note){return '<div class="stat-card"><div class="stat-top"><span>'+label+'</span><span class="stat-icon">'+icon+'</span></div><div class="stat-value">'+value+'</div><div class="stat-note">'+note+'</div></div>'}
function customerTable(items){
 if(!items.length)return '<div class="empty">لا توجد بيانات حتى الآن</div>';
 const manager=currentUser?.role==='manager';
 return '<div class="table-wrap"><table><thead><tr><th>اسم النشاط</th><th>رقم الهاتف</th><th>الموقع</th><th>المسوق المسؤول</th><th>حالة التوزيع</th><th>حالة العميل</th>'+(manager?'<th>إجراء</th>':'')+'</tr></thead><tbody>'+items.map(c=>{
  const distribution=c.reservedBy?'<span class="status orange">محجوز · '+esc(c.reservedByName||'مسوق')+'</span>':c.assignedTo?'<span class="status green">مخصص</span>':'<span class="status">متاح للفريق</span>';
  return '<tr><td><b>'+esc(c.name)+'</b><div class="muted small">'+esc(c.type)+'</div></td><td>'+esc(c.phone)+'</td><td>'+esc(c.city)+' · '+esc(c.area)+'</td><td>'+esc(c.marketer)+'</td><td>'+distribution+'</td><td><span class="status '+statusClass(c.status)+'">'+esc(c.status)+'</span></td>'+(manager?'<td><button class="secondary-btn" onclick="openAssignment(\''+esc(c.id)+'\')">تغيير التعيين</button></td>':'')+'</tr>';
 }).join('')+'</tbody></table></div>';
}
function customers(){
 const manager=currentUser?.role==='manager';
 const available=state.customers.filter(c=>!c.assignedTo&&!c.reservedBy).length;
 const assigned=state.customers.filter(c=>!!c.assignedTo).length;
 const reserved=state.customers.filter(c=>!!c.reservedBy).length;
 const stats=manager?'<div class="stats">'+stat('متاح للفريق',available,'♙','عملاء لم يتم توزيعهم')+stat('موزع على المسوقين',assigned,'♧','تعيينات حالية')+stat('محجوز لزيارة',reserved,'◷','حجوزات نشطة')+stat('إجمالي العملاء',state.customers.length,'▤','قاعدة الشركة')+'</div>':'';
 return pageIntro('قاعدة العملاء','إدارة مركزية للعملاء مع متابعة التوزيع والحجوزات وسجل الزيارات.','<button class="primary-btn" onclick="openCustomer()">＋ عميل جديد</button>')+stats+'<div class="toolbar"><input class="search" id="customerSearch" placeholder="ابحث بالاسم أو الهاتف أو الشارع أو الحي..." oninput="filterCustomers(this.value,document.querySelector(\'#customerFilter\')?.value||\'all\')">'+(manager?'<select class="search" id="customerFilter" onchange="filterCustomers(document.querySelector(\'#customerSearch\').value,this.value)"><option value="all">كل العملاء</option><option value="available">متاح للفريق</option><option value="assigned">موزع</option><option value="reserved">محجوز حالياً</option></select>':'')+'<button class="secondary-btn" onclick="exportCustomers()">↓ تصدير CSV</button></div><div id="customerTable">'+customerTable(state.customers.slice().reverse())+'</div>';
}
function filterCustomers(q='',filter='all'){
 const term=String(q||'').trim().toLowerCase();
 let rows=state.customers.filter(c=>[c.name,c.phone,c.area,c.district,c.address,c.city,c.marketer,c.reservedByName].join(' ').toLowerCase().includes(term));
 if(filter==='available')rows=rows.filter(c=>!c.assignedTo&&!c.reservedBy);
 if(filter==='assigned')rows=rows.filter(c=>!!c.assignedTo);
 if(filter==='reserved')rows=rows.filter(c=>!!c.reservedBy);
 $('#customerTable').innerHTML=customerTable(rows);
}
function openCustomer(){showModal('تسجيل عميل جديد', '<form id="customerForm"><div class="form-grid">'+field('name','اسم النشاط التجاري','text','مثال: مؤسسة...')+field('type','نوع النشاط','text','')+field('phone','رقم الهاتف','tel','')+field('city','المدينة','text','صنعاء')+field('district','المديرية / الحي','text','')+field('area','اسم الشارع','text','')+field('address','وصف العنوان','text','',true)+field('marketer','المسوق المسؤول','select','',false,state.team.map(t=>t.name))+field('status','حالة العميل','select','','', ['عميل جديد','تمت الزيارة','تحت المتابعة','تم البيع','مرفوض'])+'</div><div id="duplicateHint"></div><div class="modal-actions"><button class="primary-btn" type="submit">حفظ العميل</button><button class="secondary-btn" type="button" onclick="closeModal()">إلغاء</button></div></form>');
$('#customerForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const dup=state.customers.filter(c=>(f.phone&&c.phone===f.phone)||(c.name.trim().toLowerCase()===f.name.trim().toLowerCase()&&c.area===f.area));if(dup.length){$('#duplicateHint').innerHTML='<p class="status orange">تنبيه: توجد سجلات مشابهة. راجع الهاتف والشارع والموقع قبل الإضافة.</p>'+dup.map(c=>'<p class="small">'+esc(c.name)+' · '+esc(c.phone)+' · '+esc(c.area)+'</p>').join('');if(!confirm('تم العثور على سجل مطابق أو محتمل. هل راجعت السجلات وتؤكد أن هذا فرع/نشاط مستقل؟'))return;}state.customers.push({...f,id:Date.now(),created:today(),lat:'',lng:''});persist();closeModal();render();toast('تم حفظ العميل محلياً')}}
function field(name,label,type='text',placeholder='',full=false,options=[]){let control=type==='select'?'<select name="'+name+'" required><option value="">اختر</option>'+options.map(o=>'<option>'+esc(o)+'</option>').join('')+'</select>':'<input name="'+name+'" type="'+type+'" placeholder="'+placeholder+'" '+(name==='name'||name==='phone'?'required':'')+'>';return '<div class="field '+(full?'full':'')+'"><label>'+label+'</label>'+control+'</div>'}
function visits(){return pageIntro('الزيارات والحجوزات','سجل الزيارة عند الوصول فقط. لا يوجد تتبع مباشر للمسوقين.','<button class="primary-btn" onclick="openVisit()">＋ تسجيل زيارة</button>')+'<section class="panel"><div class="panel-head"><h3>حجوزات العملاء</h3><span class="muted small">الحجز المحلي تجريبي</span></div><div class="empty">لا توجد حجوزات نشطة حالياً. آلية الحجز المتزامن بين عدة مسوقين تحتاج قاعدة بيانات مركزية.</div></section><section class="panel"><div class="panel-head"><h3>سجل الزيارات</h3></div><div class="table-wrap"><table><thead><tr><th>العميل</th><th>المسوق</th><th>التاريخ</th><th>نتيجة الزيارة</th><th>ملاحظات</th></tr></thead><tbody>'+state.visits.map(v=>{const c=state.customers.find(x=>x.id===v.customer)||{};return '<tr><td>'+esc(c.name||'عميل غير معروف')+'</td><td>'+esc(v.marketer)+'</td><td>'+v.date+'</td><td><span class="status orange">'+esc(v.result)+'</span></td><td>'+esc(v.notes||'—')+'</td></tr>'}).join('')+'</tbody></table></div></section><div class="map-placeholder">⌖<br>عرض خريطة الزيارات يتطلب ربط خدمة خرائط ومصدر بيانات جغرافي.</div>'}
function openVisit(){const opts=state.customers.map(c=>'<option value="'+c.id+'">'+esc(c.name)+' · '+esc(c.phone)+'</option>').join('');showModal('تسجيل زيارة ميدانية','<form id="visitForm"><div class="field"><label>العميل</label><select name="customer" required>'+opts+'</select></div>'+field('marketer','المسوق','select','','',state.team.map(t=>t.name))+field('result','نتيجة الزيارة','select','','', ['مهتم','طلب عرض سعر','متابعة لاحقاً','غير مهتم','تم البيع'])+field('notes','ملاحظات','text','',true)+'<div class="field"><label>موقع GPS عند الزيارة</label><button type="button" class="secondary-btn" id="gpsBtn">⌖ تسجيل موقعي الآن</button><small id="gpsStatus" class="muted">لن يتم طلب الموقع إلا عند الضغط على الزر.</small></div><div class="modal-actions"><button class="primary-btn">حفظ الزيارة</button></div></form>');
let coords=null;$('#gpsBtn').onclick=()=>{if(!navigator.geolocation){$('#gpsStatus').textContent='المتصفح لا يدعم تحديد الموقع';return}$('#gpsStatus').textContent='جارٍ تحديد الموقع...';navigator.geolocation.getCurrentPosition(p=>{coords={lat:p.coords.latitude,lng:p.coords.longitude};$('#gpsStatus').textContent='تم تحديد الموقع عند الزيارة ✓'},()=>$('#gpsStatus').textContent='تعذر تحديد الموقع؛ تحقق من صلاحية الموقع والاتصال.',{enableHighAccuracy:true,timeout:12000})};
$('#visitForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const customer=state.customers.find(c=>c.id===Number(f.customer));state.visits.push({id:Date.now(),customer:customer.id,marketer:f.marketer,date:today(),result:f.result,notes:f.notes,coords});if(customer&&f.result==='تم البيع')customer.status='تم البيع';else if(customer&&f.result==='مهتم')customer.status='تحت المتابعة';else if(customer)customer.status='تمت الزيارة';persist();closeModal();render();toast('تم حفظ الزيارة محلياً')}}
function sales(){return pageIntro('المبيعات والاشتراكات','تسجيل المبيعات المعتمدة وربط العمولة بمن حقق البيع.','<button class="primary-btn" onclick="openSale()">＋ تسجيل عملية بيع</button>')+'<div class="stats">'+stat('عدد المبيعات',state.sales.length,'↗','عمليات مسجلة')+stat('إجمالي قيمة المبيعات',money(state.sales.reduce((a,s)=>a+s.amount,0)),'▤','قيمة الاشتراكات')+'</div><div class="table-wrap"><table><thead><tr><th>العميل</th><th>المسوق المحقق</th><th>الاشتراك</th><th>قيمة البيع</th><th>العمولة</th><th>الحالة</th></tr></thead><tbody>'+state.sales.map(s=>{const c=state.customers.find(x=>x.id===s.customer)||{};return '<tr><td>'+esc(c.name||'—')+'</td><td>'+esc(s.marketer)+'</td><td>'+esc(s.plan)+'</td><td>'+money(s.amount)+'</td><td>'+money(s.commission)+'</td><td><span class="status green">'+s.status+'</span></td></tr>'}).join('')+'</tbody></table></div>'}
function openSale(){showModal('تسجيل عملية بيع','<form id="saleForm"><div class="field"><label>العميل</label><select name="customer">'+state.customers.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('')+'</select></div>'+field('marketer','المسوق الذي حقق البيع','select','','',state.team.map(t=>t.name))+field('plan','نوع الاشتراك','select','','',['شهري','سنوي','مدى الحياة','خدمة إضافية'])+field('amount','قيمة الاشتراك (ر.ي)','number','')+'<div class="field"><label>نسبة العمولة %</label><input name="rate" type="number" min="0" max="100" value="5"></div><div class="modal-actions"><button class="primary-btn">اعتماد البيع</button></div></form>');$('#saleForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target)),amount=Number(f.amount),rate=Number(f.rate);if(amount<=0)return toast('أدخل قيمة صحيحة');state.sales.push({id:Date.now(),customer:Number(f.customer),marketer:f.marketer,plan:f.plan,amount,date:today(),commission:Math.round(amount*rate/100),status:'معتمد'});const c=state.customers.find(x=>x.id===Number(f.customer));if(c)c.status='تم البيع';persist();closeModal();render();toast('تم اعتماد البيع محلياً')}}
function commissions(){const total=state.sales.reduce((a,s)=>a+s.commission,0);return pageIntro('العمولات','تجميع تجريبي للعمولات الناتجة عن المبيعات المعتمدة.','')+'<div class="stats">'+stat('إجمالي المستحقات',money(total),'◈','حسب المبيعات الحالية')+stat('عمليات البيع',state.sales.length,'↗','عمليات معتمدة')+'</div><div class="table-wrap"><table><thead><tr><th>المسوق</th><th>عدد المبيعات</th><th>إجمالي قيمة البيع</th><th>العمولة المستحقة</th></tr></thead><tbody>'+state.team.map(t=>{const a=state.sales.filter(s=>s.marketer===t.name);return '<tr><td>'+esc(t.name)+'</td><td>'+a.length+'</td><td>'+money(a.reduce((x,s)=>x+s.amount,0))+'</td><td><b>'+money(a.reduce((x,s)=>x+s.commission,0))+'</b></td></tr>'}).join('')+'</tbody></table></div><p class="muted small">تنبيه: تسجيل المدفوعات، عكس العمولة عند الاسترداد، وقواعد عمولات حسب الباقة تحتاج إعدادات وصلاحيات في الخادم المركزي قبل التشغيل الفعلي.</p>'}
function team(){return pageIntro('فريق التسويق','إدارة بيانات المسوقين وأهدافهم.','<button class="primary-btn" onclick="openTeam()">＋ إضافة مسوق</button>')+'<div class="table-wrap"><table><thead><tr><th>المسوق</th><th>رقم الهاتف</th><th>هدف العملاء</th><th>العملاء المسجلون</th><th>المبيعات</th></tr></thead><tbody>'+state.team.map(t=>'<tr><td><b>'+esc(t.name)+'</b></td><td>'+esc(t.phone)+'</td><td>'+t.target+'</td><td>'+state.customers.filter(c=>c.marketer===t.name).length+'</td><td>'+state.sales.filter(s=>s.marketer===t.name).length+'</td></tr>').join('')+'</tbody></table></div>'}
function openTeam(){showModal('إضافة مسوق','<form id="teamForm">'+field('name','اسم المسوق','text','')+field('phone','رقم الهاتف','tel','')+field('target','الهدف الشهري','number','10')+'<div class="modal-actions"><button class="primary-btn">حفظ</button></div></form>');$('#teamForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));if(state.team.some(t=>t.name===f.name))return toast('المسوق موجود');state.team.push({...f,target:Number(f.target)});persist();closeModal();render();toast('تمت الإضافة')}}
function reports(){return pageIntro('التقارير والإحصائيات','مؤشرات مبنية على بيانات النسخة التجريبية الحالية.','<button class="secondary-btn" onclick="exportCustomers()">↓ تصدير العملاء</button>')+'<div class="stats">'+stat('عملاء جدد',state.customers.filter(c=>c.created===today()).length,'♙','اليوم')+stat('زيارات اليوم',state.visits.filter(v=>v.date===today()).length,'⌖','اليوم')+stat('مبيعات اليوم',state.sales.filter(s=>s.date===today()).length,'↗','اليوم')+stat('نسبة التحويل',state.customers.length?Math.round(state.sales.length/state.customers.length*100)+'%':'0%','◈','مبيعات إلى عملاء')+'</div><section class="panel"><h3>ملاحظة حول التقارير</h3><p class="muted">هذه الإحصاءات محلية على هذا المتصفح ولا تمثل بيانات فريق موزعة على أجهزة متعددة. يلزم خادم مركزي لحساب الأداء المشترك بشكل موثوق.</p></section>'}
function settings(){return pageIntro('الإعدادات','تفضيلات العرض والبيانات التجريبية.','')+'<section class="panel"><h3>المظهر</h3><p class="muted">يمكنك التبديل بين الوضع النهاري والليلي من أعلى الصفحة.</p><button class="secondary-btn" onclick="toggleTheme()">تبديل المظهر</button></section><section class="panel"><h3>بيانات التطبيق</h3><p class="muted">البيانات تحفظ في LocalStorage على هذا المتصفح فقط. لا توجد مصادقة أو مزامنة سحابية حالياً.</p><button class="danger-btn" onclick="resetDemo()">إعادة بيانات العرض التجريبي</button></section><section class="panel"><h3>الأمان والخصوصية</h3><ul class="muted"><li>لا يوجد تتبع مباشر للمسوقين.</li><li>GPS لا يطلب إلا عند تسجيل زيارة وبضغط المستخدم.</li><li>هذه النسخة ليست جاهزة للاستخدام الإنتاجي أو حفظ بيانات عملاء حقيقية.</li></ul></section>'}
function showModal(title,html){$('#modalTitle').textContent=title;$('#modalBody').innerHTML=html;$('#modalBackdrop').classList.add('show')}
function closeModal(){$('#modalBackdrop').classList.remove('show')}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function exportCustomers(){const rows=[['الاسم','النوع','الهاتف','المدينة','المديرية','الشارع','العنوان','الحالة','المسوق'],...state.customers.map(c=>[c.name,c.type,c.phone,c.city,c.district,c.area,c.address,c.status,c.marketer])];const csv='\uFEFF'+rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='customers.csv';a.click();URL.revokeObjectURL(a.href)}
function toggleTheme(){const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem('basma-theme',next);$('#themeBtn').textContent=next==='dark'?'☾':'☼'}
function resetDemo(){if(!confirm('إعادة تحميل بيانات العرض التجريبي؟ سيتم حذف التعديلات المحلية.'))return;localStorage.removeItem('basma-marketers-demo');location.reload()}
$('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)setPage(b.dataset.page)});
$('#quickAdd').onclick=openCustomer;$('#themeBtn').onclick=toggleTheme;$('#modalClose').onclick=closeModal;$('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()};$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
$('#roleSwitch').onclick=()=>{state.role=state.role==='manager'?'marketer':'manager';toast(state.role==='manager'?'تم اختيار عرض المدير':'تم اختيار عرض المسوق (توضيحي)')};
const savedTheme=localStorage.getItem('basma-theme');if(savedTheme){document.documentElement.dataset.theme=savedTheme;$('#themeBtn').textContent=savedTheme==='dark'?'☾':'☼'}
initApp();

const apiErrorMessages={
  unauthorized:'سجّل الدخول للمتابعة.',
  forbidden:'ليست لديك صلاحية لتنفيذ هذا الإجراء.',
  invalid_credentials:'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  possible_duplicate:'يوجد سجل مشابه في قاعدة الشركة. راجع بيانات العميل قبل المتابعة.',
  customer_reserved:'هذا العميل محجوز حالياً لمسوق آخر.',
  customer_assigned_to_another:'هذا العميل موزع على مسوق آخر، ولم تنتهِ بعد مهلة إتاحته لبقية المسوقين.',
  reservation_required:'يجب حجز العميل قبل تسجيل الزيارة.',
  bootstrap_not_authorized:'مفتاح إعداد المدير الأول غير صحيح أو لم يتم ضبطه على الخادم.',
  bootstrap_already_completed:'تم إنشاء حساب المدير مسبقاً.'
};
function cookieValue(name){const item=document.cookie.split('; ').find(x=>x.startsWith(name+'='));return item?decodeURIComponent(item.slice(name.length+1)):''}
async function apiCall(path,options={}){
 const method=(options.method||'GET').toUpperCase(),headers={...(options.headers||{})};
 if(options.body!==undefined)headers['Content-Type']='application/json';
 if(!['GET','HEAD'].includes(method)){const csrf=cookieValue('bm_csrf');if(csrf)headers['X-CSRF-Token']=csrf}
 const response=await fetch(path,{method,headers,body:options.body===undefined?undefined:JSON.stringify(options.body),credentials:'same-origin'});
 let data={};try{data=await response.json()}catch{}
 if(!response.ok){const e=new Error(data.message||apiErrorMessages[data.error]||data.error||'تعذر تنفيذ الطلب');e.status=response.status;e.data=data;throw e}
 return data;
}
function showAuth(error='',setup=false){
 $('#appShell').hidden=true;$('#authGate').hidden=false;
 const title=setup?'إنشاء حساب المدير الأول':'تسجيل الدخول';
 const description=setup?'هذه أول مرة يتم فيها إعداد النظام. أدخل مفتاح التهيئة الذي تم ضبطه على الخادم.':'أدخل بيانات حسابك للوصول إلى قاعدة بيانات الشركة المركزية.';
 $('#authGate').innerHTML='<section class="auth-card"><div class="auth-brand"><div class="brand-mark">ب</div><div><b>بصمة سوفت</b><small class="muted">نظام إدارة المسوقين</small></div></div><h1>'+title+'</h1><p>'+description+'</p><div id="authError" class="auth-error '+(error?'show':'')+'">'+esc(error)+'</div><form id="authForm">'+(setup?'<div class="field"><label>الاسم الكامل للمدير</label><input name="fullName" required maxlength="120"></div>':'')+'<div class="field"><label>البريد الإلكتروني</label><input name="email" type="email" required autocomplete="username"></div><div class="field"><label>كلمة المرور</label><input name="password" type="password" required minlength="12" autocomplete="'+(setup?'new-password':'current-password')+'"></div>'+(setup?'<div class="field"><label>مفتاح التهيئة</label><input name="bootstrapKey" type="password" required autocomplete="off"></div>':'')+'<button class="primary-btn" style="width:100%" type="submit">'+(setup?'إنشاء حساب المدير':'دخول آمن')+'</button></form></section>';
 $('#authForm').onsubmit=async e=>{
  e.preventDefault();const f=Object.fromEntries(new FormData(e.target));
  const errorBox=$('#authError');errorBox.classList.remove('show');
  try{
   if(setup){
    await apiCall('/api/bootstrap',{method:'POST',headers:{'X-Bootstrap-Key':f.bootstrapKey},body:{fullName:f.fullName,email:f.email,password:f.password}});
   }
   await apiCall('/api/login',{method:'POST',body:{email:f.email,password:f.password}});
   await initApp();
  }catch(err){errorBox.textContent=err.message;errorBox.classList.add('show')}
 };
}
function mapCustomer(c){return {id:c.id,name:c.business_name,type:c.business_type||'',phone:c.phone||'',city:c.city||'',district:c.district||'',area:c.street||'',address:c.address_description||'',status:({new:'عميل جديد',visited:'تمت الزيارة',follow_up:'تحت المتابعة',sold:'تم البيع',rejected:'مرفوض'}[c.status]||c.status),marketer:c.marketer_name||'غير معيّن',created:c.created_at,lat:c.latitude??'',lng:c.longitude??'',createdBy:c.created_by,assignedTo:c.assigned_to||null,reservedBy:c.reserved_by||null,reservedByName:c.reserved_by_name||'',reservationExpiresAt:c.reservation_expires_at||null,neighborhood:c.neighborhood||''}}
async function refreshData(){
 const [c,v,r,u]=await Promise.all([apiCall('/api/customers'),apiCall('/api/visits'),apiCall('/api/reservations'),apiCall('/api/unconverted-customers')]);
 state.customers=c.customers.map(mapCustomer);
 state.unconverted=u.customers.map(x=>({...mapCustomer(x),lastVisitAt:x.last_visit_at,lastResult:x.last_result,lastMarketerName:x.last_marketer_name,visitCount:x.visit_count||0}));
 state.visits=v.visits.map(x=>({id:x.id,customer:x.customer_id,marketer:x.marketer_name,date:String(x.visited_at).slice(0,10),result:x.result,notes:x.notes||'',latitude:x.latitude,longitude:x.longitude}));
 state.reservations=r.reservations;
 if(currentUser.role==='manager'){
  const u=await apiCall('/api/users');state.team=u.users.filter(x=>x.role==='marketer').map(x=>({id:x.id,name:x.full_name,phone:x.phone||'',target:0,email:x.email}));
 }else state.team=[{id:currentUser.id,name:currentUser.fullName,phone:currentUser.phone||'',target:0,email:currentUser.email}];
}
function setupMarketerMobileNav(){
 const nav=$('#marketerMobileNav');
 const marketer=currentUser?.role==='marketer';
 document.body.classList.toggle('marketer-mobile',marketer);
 nav.hidden=!marketer;
 if(!marketer){nav.innerHTML='';return}
 const items=[
  ['dashboard','⌂','الرئيسية'],
  ['customers','♙','العملاء'],
  ['visits','⌖','الزيارات'],
  ['unconverted','↻','إعادة الزيارة'],
  ['settings','⚙','حسابي']
 ];
 nav.innerHTML=items.map(([page,icon,label])=>'<button type="button" class="mobile-nav-item" data-mobile-page="'+page+'" aria-label="'+label+'"><span class="mobile-nav-icon">'+icon+'</span><span>'+label+'</span></button>').join('');
 nav.querySelectorAll('[data-mobile-page]').forEach(button=>button.addEventListener('click',()=>setPage(button.dataset.mobilePage)));
 syncMarketerMobileNav();
}
function syncMarketerMobileNav(){
 const nav=$('#marketerMobileNav');if(!nav)return;
 nav.querySelectorAll('[data-mobile-page]').forEach(button=>{
  const active=button.dataset.mobilePage===state.page;
  button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 });
}
async function initApp(){
 try{
  const me=await apiCall('/api/me');currentUser=me.user;
  state.role=currentUser.role;
  $('#authGate').hidden=true;$('#appShell').hidden=false;
  $('.workspace').innerHTML='<span class="live-dot"></span> اتصال بقاعدة الشركة المركزية';
  $('.sidebar-foot b').textContent=currentUser.fullName;
  $('.sidebar-foot small').textContent=currentUser.role==='manager'?'مدير النظام':'مسوق';
  $('#roleSwitch').textContent='↪';$('#roleSwitch').title='تسجيل الخروج';
  $('#roleSwitch').onclick=async()=>{try{await apiCall('/api/logout',{method:'POST',body:{}})}catch{}currentUser=null;showAuth()};
  document.querySelector('[data-page="team"]').hidden=currentUser.role!=='manager';
  document.querySelector('[data-page="sales"]').hidden=true;
  document.querySelector('[data-page="commissions"]').hidden=true;
  document.querySelector('[data-page="reports"]').hidden=true;
  setupMarketerMobileNav();
  await refreshData();render();
 }catch(e){
  let setup=false;try{setup=(await apiCall('/api/setup-status')).needsBootstrap}catch{}
  showAuth('',setup);
 }
}
function dashboard(){
 const manager=currentUser?.role==='manager';
 const mine=manager?state.customers:state.customers.filter(c=>c.createdBy===currentUser?.id||c.assignedTo===currentUser?.id);
 const recent=mine.slice(0,5);
 const welcome=manager?'تابع قاعدة العملاء وأداء فريق التسويق والحجوزات من لوحة الإدارة.':'هذه مساحتك اليومية لمتابعة عملائك وزياراتك وفرص إعادة الزيارة. بياناتك محفوظة في قاعدة الشركة المركزية.';
 const cards=manager
  ?stat('إجمالي العملاء',state.customers.length,'♙','قاعدة الشركة')+stat('الزيارات المسجلة',state.visits.length,'⌖','كل زيارات الفريق')+stat('المسوقون',state.team.length,'♧','الحسابات النشطة')+stat('الحجوزات النشطة',state.reservations.length,'◷','حجوزات الفريق')
  :stat('عملائي الحاليون',mine.length,'♙','أضفتهم أو كُلّفت بهم')+stat('زياراتي المسجلة',state.visits.length,'⌖','سجل زياراتك')+stat('متاحون لإعادة الزيارة',state.unconverted.filter(c=>!c.reservedBy).length,'↻','بعد مرور 10 أيام')+stat('حجوزاتي النشطة',state.reservations.length,'◷','حجوزات باسمك');
 const actions='<button class="primary-btn" onclick="openCustomer()">＋ إضافة عميل</button><button class="secondary-btn" onclick="setPage(\'visits\')">تسجيل زيارة</button>'+(manager?'':'<button class="secondary-btn" onclick="setPage(\'unconverted\')">العملاء المتاحون لإعادة الزيارة</button>');
 return '<section class="welcome"><h2>مرحباً '+esc(currentUser?.fullName||'')+'</h2><p>'+welcome+'</p><div class="quick-links">'+actions+'</div></section><div class="stats">'+cards+'</div><section class="panel"><div class="panel-head"><h3>'+(manager?'أحدث العملاء في الشركة':'عملائي')+'</h3><button class="text-btn" onclick="setPage(\'customers\')">عرض الكل ←</button></div>'+customerTable(recent)+'</section>';
}
function openCustomer(){
 showModal('تسجيل عميل في قاعدة الشركة','<form id="customerForm"><div class="form-grid">'+field('businessName','اسم النشاط التجاري','text','مثال: مؤسسة...')+field('businessType','نوع النشاط','text','')+field('phone','رقم الهاتف','tel','')+field('city','المدينة','text','')+field('district','المديرية','text','')+field('neighborhood','الحي','text','')+field('street','اسم الشارع','text','')+field('addressDescription','وصف العنوان','text','',true)+(currentUser.role==='manager'?'<div class="field"><label>المسوق المسؤول (اختياري)</label><select name="assignedTo"><option value="">متاح للفريق</option>'+state.team.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join('')+'</select></div>':'')+'</div><div id="duplicateHint"></div><div class="modal-actions"><button class="primary-btn" type="submit">حفظ في قاعدة الشركة</button><button class="secondary-btn" type="button" onclick="closeModal()">إلغاء</button></div></form>');
 $('#customerForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{await apiCall('/api/customers',{method:'POST',body:f});await refreshData();closeModal();render();toast('تم حفظ العميل في قاعدة الشركة')}catch(err){$('#duplicateHint').innerHTML='<p class="status orange">'+esc(err.message)+'</p>'}}
}
function openAssignment(customerId){
 if(currentUser?.role!=='manager')return toast('هذه العملية متاحة للمدير فقط');
 const customer=state.customers.find(c=>c.id===customerId);
 if(!customer)return toast('تعذر العثور على العميل؛ حدّث الصفحة وحاول مجدداً');
 const options=state.team.map(t=>'<option value="'+esc(t.id)+'" '+(customer.assignedTo===t.id?'selected':'')+'>'+esc(t.name)+'</option>').join('');
 showModal('إدارة توزيع العميل','<p class="muted small">العميل: <b>'+esc(customer.name)+'</b>. عند تغيير المسؤول سيتم إلغاء أي حجز نشط مرتبط بالتعيين السابق، مع الاحتفاظ بسجل الزيارات كما هو.</p><form id="assignmentForm"><div class="field"><label>المسوق المسؤول</label><select name="assignedTo"><option value="">متاح للفريق — دون تعيين</option>'+options+'</select></div><div class="modal-actions"><button class="primary-btn" type="submit">حفظ التوزيع</button><button class="secondary-btn" type="button" onclick="closeModal()">إلغاء</button></div></form>');
 $('#assignmentForm').onsubmit=async e=>{
  e.preventDefault();
  const assignedTo=new FormData(e.target).get('assignedTo')||null;
  try{
   const result=await apiCall('/api/customers/'+encodeURIComponent(customerId)+'/assignment',{method:'PATCH',body:{assignedTo}});
   await refreshData();closeModal();render();
   toast(result.unchanged?'العميل معين بالفعل للمسوق نفسه':'تم تحديث التوزيع وتوثيق العملية');
  }catch(err){toast(err.message)}
 };
}
function unconverted(){
 const rows=state.unconverted.map(c=>'<tr><td><b>'+esc(c.name)+'</b><div class="muted small">'+esc(c.type)+'</div></td><td>'+esc(c.phone||'—')+'</td><td>'+esc([c.city,c.district,c.area].filter(Boolean).join(' · ')||'—')+'</td><td>'+esc(c.lastMarketerName||'—')+'</td><td>'+esc(c.lastResult||'—')+'</td><td>'+esc(c.lastVisitAt||'—')+'</td><td>'+c.visitCount+'</td><td>'+(c.reservedBy?'<span class="status orange">محجوز لدى '+esc(c.reservedByName||'مسوق')+'</span>':'<button class="primary-btn" onclick="openVisit(\''+esc(c.id)+'\')">إعادة زيارة</button>')+'</td></tr>').join('');
 return pageIntro('العملاء الذين تم زيارتهم ولم يشتركوا','تظهر هنا تلقائياً الجهات التي مرّ على آخر زيارة لها 10 أيام أو أكثر دون اشتراك معتمد. يمكن لأي مسوق حجزها وإعادة محاولة إقناعها.','<button class="secondary-btn" onclick="refreshData().then(render).catch(e=>toast(e.message))">↻ تحديث القائمة</button>')+'<div class="stats">'+stat('متاحون لإعادة التسويق',state.unconverted.filter(c=>!c.reservedBy).length,'↻','بعد مرور 10 أيام')+stat('محجوزون حالياً',state.unconverted.filter(c=>!!c.reservedBy).length,'◷','لمنع تكرار الجهد')+'</div><section class="panel"><div class="table-wrap"><table><thead><tr><th>العميل</th><th>الهاتف</th><th>الموقع</th><th>آخر مسوق</th><th>نتيجة آخر زيارة</th><th>تاريخ آخر زيارة</th><th>عدد الزيارات</th><th>الإجراء</th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="empty">لا توجد حالياً جهات تجاوزت مهلة 10 أيام دون اشتراك</td></tr>')+'</tbody></table></div></section>';
}
function visits(){
 const rows=state.visits.map(v=>{const c=state.customers.find(x=>x.id===v.customer)||{};return '<tr><td>'+esc(c.name||'—')+'</td><td>'+esc(v.marketer)+'</td><td>'+esc(v.date)+'</td><td>'+esc(v.result)+'</td><td>'+esc(v.notes||'—')+'</td></tr>'}).join('');
 const holds=state.reservations.map(r=>'<tr><td>'+esc(r.business_name)+'</td><td>'+esc(r.marketer_name)+'</td><td>'+esc(r.expires_at)+'</td><td><span class="status orange">محجوز</span></td></tr>').join('');
 return pageIntro('الزيارات والحجوزات','سجل مركزي ثابت. لا يتم طلب GPS إلا عند تسجيل الزيارة.','<button class="primary-btn" onclick="openVisit()">＋ تسجيل زيارة</button>')+'<section class="panel"><h3>الحجوزات النشطة</h3><div class="table-wrap"><table><thead><tr><th>العميل</th><th>المسوق</th><th>ينتهي في</th><th>الحالة</th></tr></thead><tbody>'+ (holds||'<tr><td colspan="4">لا توجد حجوزات نشطة</td></tr>')+'</tbody></table></div></section><section class="panel"><h3>سجل الزيارات</h3><div class="table-wrap"><table><thead><tr><th>العميل</th><th>المسوق</th><th>التاريخ</th><th>النتيجة</th><th>ملاحظات</th></tr></thead><tbody>'+(rows||'<tr><td colspan="5">لا توجد زيارات مسجلة</td></tr>')+'</tbody></table></div></section><div class="map-placeholder">بيانات المواقع محفوظة عند تسجيل الزيارة فقط. عرض الخريطة سيضاف في مرحلة الخرائط.</div>';
}
function openVisit(selectedCustomerId=''){
 const options=state.customers.map(c=>'<option value="'+esc(c.id)+'" '+(String(c.id)===String(selectedCustomerId)?'selected':'')+'>'+esc(c.name)+' · '+esc(c.phone)+'</option>').join('');
 showModal('تسجيل زيارة ميدانية','<form id="visitForm"><div class="field"><label>العميل</label><select name="customerId" required>'+options+'</select></div>'+field('result','نتيجة الزيارة','select','','', ['مهتم','طلب عرض سعر','متابعة لاحقاً','غير مهتم','تم البيع'])+field('notes','ملاحظات','text','',true)+'<div class="field"><label>GPS عند الزيارة فقط</label><button type="button" class="secondary-btn" id="gpsBtn">⌖ تسجيل موقعي الآن</button><small id="gpsStatus" class="muted">لن يطلب الموقع إلا عند ضغط الزر.</small></div><div class="modal-actions"><button class="primary-btn">حفظ الزيارة</button></div></form>');
 let coords=null;
 $('#gpsBtn').onclick=()=>{if(!navigator.geolocation)return $('#gpsStatus').textContent='المتصفح لا يدعم GPS';$('#gpsStatus').textContent='جارٍ تحديد الموقع...';navigator.geolocation.getCurrentPosition(p=>{coords={latitude:p.coords.latitude,longitude:p.coords.longitude};$('#gpsStatus').textContent='تم تحديد الموقع ✓'},()=>$('#gpsStatus').textContent='تعذر تحديد الموقع',{enableHighAccuracy:true,timeout:12000})};
 $('#visitForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{
  const c=state.customers.find(x=>x.id===f.customerId);
  if(currentUser.role==='marketer'&&c&&c.createdBy!==currentUser.id){
   const active=state.reservations.find(r=>r.customer_id===f.customerId&&r.marketer_id===currentUser.id);
   if(!active)await apiCall('/api/reservations',{method:'POST',body:{customerId:f.customerId}});
  }
  await apiCall('/api/visits',{method:'POST',body:{customerId:f.customerId,result:f.result,notes:f.notes,...(coords||{})}});
  await refreshData();closeModal();render();toast('تم حفظ الزيارة في السجل المركزي');
 }catch(err){toast(err.message)}};
}
function team(){
 if(currentUser.role!=='manager')return '<div class="panel">هذه الصفحة متاحة للمدير فقط.</div>';
 return pageIntro('فريق التسويق','حسابات المسوقين الفعلية في النظام.','<button class="primary-btn" onclick="openTeam()">＋ إنشاء حساب مسوق</button>')+'<div class="table-wrap"><table><thead><tr><th>المسوق</th><th>البريد</th><th>الهاتف</th><th>حالة الحساب</th></tr></thead><tbody>'+state.team.map(t=>'<tr><td>'+esc(t.name)+'</td><td>'+esc(t.email)+'</td><td>'+esc(t.phone)+'</td><td><span class="status green">نشط</span></td></tr>').join('')+'</tbody></table></div>';
}
function openTeam(){
 showModal('إنشاء حساب مسوق','<form id="teamForm">'+field('fullName','الاسم الكامل','text','')+field('email','البريد الإلكتروني','email','')+field('phone','رقم الهاتف','tel','')+field('password','كلمة مرور مؤقتة (12 حرفاً على الأقل)','password','')+'<div class="modal-actions"><button class="primary-btn">إنشاء الحساب</button></div></form>');
 $('#teamForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{await apiCall('/api/users',{method:'POST',body:f});await refreshData();closeModal();render();toast('تم إنشاء حساب المسوق')}catch(err){toast(err.message)}};
}
function sales(){return pageIntro('المبيعات والاشتراكات','هذه الوحدة لم تُربط بعد بالخادم المركزي.','')+'<section class="panel"><p class="muted">لن نعرض بيانات تجريبية أو نحسب عمولات محلية. سيتم تفعيل المبيعات والعمولات بعد إضافة دورة اعتماد البيع والاسترداد وقواعد العمولة على الخادم.</p></section>'}
function commissions(){return pageIntro('العمولات','قواعد العمولات والمدفوعات المركزية قيد التنفيذ.','')+'<section class="panel"><p class="muted">لن يتم احتساب عمولة فعلية قبل اعتماد المبيعات وربط قواعد العمولة والمدفوعات.</p></section>'}
function reports(){return pageIntro('التقارير','التقارير المشتركة ستظهر بعد تفعيل المبيعات والعمولات.','')+'<section class="panel"><p class="muted">تعتمد التقارير على سجلات الخادم المركزي فقط.</p></section>'}
function settings(){return pageIntro('الإعدادات','إعدادات الحساب والمظهر.','')+'<section class="panel"><h3>المظهر</h3><p class="muted">يمكنك التبديل بين الوضع النهاري والليلي.</p><button class="secondary-btn" onclick="toggleTheme()">تبديل المظهر</button></section><section class="panel"><h3>الحساب الحالي</h3><p>'+esc(currentUser?.fullName||'')+' · '+esc(currentUser?.role||'')+'</p><button class="danger-btn" onclick="document.querySelector(\'#roleSwitch\').click()">تسجيل الخروج</button></section>'}
