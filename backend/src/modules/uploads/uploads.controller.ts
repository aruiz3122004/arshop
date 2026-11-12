import { Body, Controller, Post } from "@nestjs/common";
import { UploadsService } from "./uploads.service";
import { Roles } from "../../common/decorators/roles.decorator";

@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Roles("ADMIN")
  @Post("product-image/sign")
  signProductImage(
    @Body("filename") filename: string,
    @Body("contentType") contentType: string,
  ) {
    return this.uploads.signProductImage(filename, contentType);
  }
}
