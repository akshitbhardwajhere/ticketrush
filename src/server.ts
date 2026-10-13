import { app } from "./index.js";
import { startAdmitter } from "./queue.js";
import { config } from "./config.js";
import { startOutboxWorker } from "./outbox.js";
import { startPaymentReconciliation } from "./services/payment-service.js";

startAdmitter();
startOutboxWorker();
startPaymentReconciliation();
app.listen(config.port, () => console.log(`TicketRush on :${config.port}`));
