function refreshCartBadge(){let n=cartCount();document.querySelectorAll('.count').forEach(x=>x.textContent=n.toLocaleString('fa-IR'))}
async function addCart(id,qty=1,selection=false){
  let p=product(id);if(!p)return false;if(!selection){quickAdd(id);return false}
  let d=selection===true?selectedVariantDetails(id):selection,size=d.size,color=d.color;
  if(!size){toast('لطفاً سایز را انتخاب کنید');return false}if(!color){toast('لطفاً رنگ را انتخاب کنید');return false}
  let v=variantFor(p,size,color);if(!v||v.stock<=0){toast('این ترکیب سایز و رنگ موجود نیست');return false}
  let item=db.cart.find(x=>x.id===id&&x.size===size&&x.color===color),newQty=(item?.qty||0)+Number(qty||1);
  if(newQty>v.stock){toast(`حداکثر موجودی این مدل ${v.stock} عدد است`);return false}
  try{
    if(item)await StoreServices.cart.update(`${id}::${size}::${color}`,{qty:newQty,variantId:v.id});
    else await StoreServices.cart.add({id,variantId:v.id,size,color,qty:Math.min(Number(qty)||1,v.stock)});
    save();refreshCartBadge();toast('محصول به سبد خرید اضافه شد');closeModal();if(path()==='/cart')render();return true;
  }catch(error){toast(error.message||'ذخیره سبد خرید انجام نشد.');return false}
}
async function changeCart(index,delta){
  let item=typeof index==='number'?db.cart[index]:db.cart.find(x=>x.id===index);if(!item)return;
  let p=product(item.id),v=variantFor(p,item.size,item.color),maxStock=v?Number(v.stock||0):0,qty=Number(item.qty)+Number(delta);
  if(qty<1){await removeCart(index);return}if(qty>maxStock){toast(`حداکثر موجودی این مدل ${maxStock} عدد است`);return}
  try{await StoreServices.cart.update(`${item.id}::${item.size}::${item.color}`,{qty});save();refreshCartBadge();render()}
  catch(error){toast(error.message||'به‌روزرسانی سبد خرید انجام نشد.')}
}
async function changeCartVariant(index,axis,value){
  let item=typeof index==='number'?db.cart[index]:db.cart.find(x=>x.id===index);if(!item)return;
  let size=axis==='size'?value:item.size,color=axis==='color'?value:item.color,v=variantFor(product(item.id),size,color);
  if(!v||v.stock<1){toast('ترکیب انتخابی موجود نیست');render();return}
  let existing=db.cart.find(x=>x.id===item.id&&x.size===size&&x.color===color&&x!==item);
  try{
    const qty=existing?Math.min(v.stock,existing.qty+item.qty):Math.min(item.qty,v.stock);
    await StoreServices.cart.update(`${item.id}::${item.size}::${item.color}`,{size,color,variantId:v.id,qty});
    save();refreshCartBadge();render();
  }catch(error){toast(error.message||'تغییر واریانت انجام نشد.')}
}
async function removeCart(index){
  let item=typeof index==='number'?db.cart[index]:db.cart.find(x=>x.id===index);if(!item)return;
  const key=`${item.id}::${item.size}::${item.color}`;
  try{await StoreServices.cart.remove(key);save();refreshCartBadge();render();toast('محصول از سبد حذف شد')}
  catch(error){toast(error.message||'حذف محصول از سبد انجام نشد.')}
}
