import { Router } from "express";
import { addProduct, updateProduct, updateProductStatus, deleteProduct, getProductByAdmin, getProduct, getProuctBySlug, getProductbyCategoryId, getProductByCategorySlug, searchProduct } from "../controllers/product.controller.js";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});

const router = Router();

router.route("/").post(upload.fields([
    { name: "featureImage", maxCount: 1 },
    { name: "image", maxCount: 1 },
    { name: "bottle", maxCount: 1 },
    { name: "variant", maxCount: 10 },
    { name: "banners", maxCount: 10 },
    { name: "label", maxCount: 5 },
    { name: "steps", maxCount: 5 }
]), addProduct);

router.route("/:id").put(upload.fields([
    { name: "featureImage", maxCount: 1 },
    { name: "image", maxCount: 1 },
    { name: "bottle", maxCount: 1 },
    { name: "variant", maxCount: 5 },
    { name: "banners", maxCount: 5 },
    { name: "label", maxCount: 5 },
    { name: "steps", maxCount: 5 }
]), updateProduct);

router.route("/status/:id").patch(updateProductStatus);
router.route("/:id").delete(deleteProduct);
router.route("/dashboard").get(getProductByAdmin);
router.route("/search").get(searchProduct)
router.route("/").get(getProduct);
router.route("/category/slug/:slug").get(getProductByCategorySlug)
router.route("/categoryId/:id").get(getProductbyCategoryId);
router.route("/:slug").get(getProuctBySlug);
export default router;