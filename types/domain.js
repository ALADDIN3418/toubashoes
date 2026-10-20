/* JSDoc contracts mirrored by prisma/schema.prisma. Keep provider implementations aligned. */
/** @typedef {'customer'|'admin'|'super_admin'} AppRole */
/** @typedef {'NEW'|'CONFIRMED'|'PROCESSING'|'SHIPPED'|'DELIVERED'|'CANCELLED'} OrderStatus */
/** @typedef {'PENDING'|'PAID'|'FAILED'|'REFUNDED'} PaymentStatus */
/** @typedef {{id:string,size:string,color:string,sku:string,stock:number,price?:number}} ProductVariant */
/** @typedef {{id:string,slug:string,name:string,sku:string,category:string,shortDesc:string,longDesc:string,price:number,oldPrice:number,discountPercent:number,images:string[],colors:string[],sizes:string[],variants:ProductVariant[],active:boolean,featured:boolean,bestSeller:boolean,createdAt:string,updatedAt:string}} Product */
/** @typedef {{id:string,number:string,customer:string,phone:string,itemsList:Array,subtotal:number,discount:number,shipping:number,total:number,status:OrderStatus,paymentStatus:PaymentStatus,trackingCode:string,createdAt:string}} Order */
/** @typedef {{id:string,orderId:string,provider:'bitpay',authority:string,invoiceId?:string,referenceId?:string,amountToman:number,status:'PENDING'|'SUCCEEDED'|'FAILED'|'MANUAL',createdAt:string,paidAt?:string}} Payment */
